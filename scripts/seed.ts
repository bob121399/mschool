// Local/test seed (spec 6 step 6.2–6.6). Hard-fails unless ALLOW_SEED=true and the Supabase host is
// local — or, for a dedicated hosted demo project, an exact typed confirmation naming that project and
// an empty tenants table (never an environment with real customers). Drafts and chunks are created with the service client (trusted fixture path); approval,
// publication and assignment run under the HR's own session, so human-gate triggers stay active.
// Synthetic content only: «демонстрационные регламенты», no real Paynet rules, clients or secrets.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import type { Json } from "../lib/database.types";
import { chunkPages } from "../lib/chunking";
import { parseInChild } from "../worker/parse";
import { totp } from "../tests/support/totp";
import { TEST_EMBEDDING_MODEL, testEmbedding } from "./lib/test-embedding";
import { embeddings } from "../lib/ai/openai";
import { aiConfigured } from "../lib/config";
import {
  createAuthUser, createEmployee, createSuperadmin, enrollTotp, lessonsOfCourse, must, provisionTenant, publishTrack,
  RUBRIC_FIXTURE, serviceClient, signIn, supabaseEnv, type Db, type Grade,
} from "./lib/world";

if (existsSync(".env.local") && !process.env.SUPABASE_SECRET_KEY) loadEnvFile(".env.local");

const GRADES: Grade[] = ["junior", "middle", "senior", "head"];
const DOMAIN = "demo.mschool.local";

/** Returns true for a confirmed hosted demo project (main() then also requires an empty tenants table). */
function guard(): boolean {
  if (process.env.ALLOW_SEED !== "true") throw new Error("Refusing to seed: set ALLOW_SEED=true (local/test only).");
  const host = new URL(supabaseEnv().url).hostname;
  if (["127.0.0.1", "localhost", "host.docker.internal"].includes(host)) return false;
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  const expected = `SEED SYNTHETIC DEMO INTO ${ref}`;
  if (!ref || process.env.SEED_REMOTE_DEMO_CONFIRM !== expected) {
    throw new Error(`Refusing to seed remote host ${host}. For a dedicated demo project set SEED_REMOTE_DEMO_CONFIRM="${expected}".`);
  }
  return true;
}

/** Real embeddings when AI is configured (query time uses the same model), else the test namespace (D-09). */
async function embedChunks(contents: string[]) {
  if (!aiConfigured()) return contents.map((c) => ({ embedding: testEmbedding(c), embedding_model: TEST_EMBEDDING_MODEL }));
  const out: { embedding: string; embedding_model: string }[] = [];
  for (let i = 0; i < contents.length; i += 128) {
    const { model, vectors } = await embeddings(contents.slice(i, i + 128));
    out.push(...vectors.map((embedding) => ({ embedding, embedding_model: model })));
  }
  return out;
}

function password(): string {
  return process.env.SEED_PASSWORD?.trim() || `Demo-${randomBytes(12).toString("base64url")}`;
}

async function source(admin: Db, hr: Db, tenantId: string, file: string, title: string) {
  const bytes = readFileSync(file);
  const id = randomUUID();
  const path = `${tenantId}/${id}/${randomUUID()}.pdf`;
  must(await hr.from("documents").insert({ id, tenant_id: tenantId, title, object_path: path, original_filename: file.split("/").at(-1)!,
    sha256: createHash("sha256").update(bytes).digest("hex"), mime_type: "application/pdf", size_bytes: bytes.length }).select("id"), "document");
  const up = await hr.storage.from("knowledge").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error(`upload ${file}: ${up.error.message}`);
  const parsed = await parseInChild(new Uint8Array(bytes), "application/pdf");
  if ("error" in parsed) throw new Error(`parse ${file}: ${parsed.error}`);
  const text = parsed.pages.reduce((s, p) => s + p.text.trim().length, 0);
  if (text < 50) {
    must(await admin.from("documents").update({ status: "needs_review", error_code: "SCAN_TEXT_LAYER_MISSING",
      page_count: parsed.pages.length, char_count: text }).eq("id", id).select("id"), "scan status");
    return { id, chunkIds: [] as string[] };
  }
  must(await admin.from("documents").update({ status: "processing" }).eq("id", id).select("id"), "processing");
  const chunks = chunkPages(parsed.pages);
  const vectors = await embedChunks(chunks.map((c) => c.content));
  const rows = chunks.map((c, i) => ({ tenant_id: tenantId, document_id: id, chunk_index: i, page: c.page, content: c.content,
    ...vectors[i]! }));
  const inserted = must(await admin.from("document_chunks").insert(rows).select("id,chunk_index"), "chunks");
  must(await admin.from("documents").update({ status: "review", page_count: parsed.pages.length, char_count: text })
    .eq("id", id).select("id"), "review");
  const approved = await hr.rpc("approve_document", { p_document: id });
  if (approved.error) throw new Error(`approve: ${approved.error.message}`);
  return { id, chunkIds: inserted.sort((a, b) => a.chunk_index - b.chunk_index).map((c) => c.id) };
}

const TOPICS: Record<"a" | "b", { name: string; module1: string; module2: string; lessons: [string, string, string, string]; question: string }> = {
  a: { name: "Касса", module1: "Проверка и объяснение", module2: "Фиксация и исключения",
    lessons: ["Знакомство с регламентом кассы", "Проверка документа клиента", "Объяснение суммы и комиссии", "Журнал смены и исключения"],
    question: "Клиент просит провести операцию, но данные в заявке отличаются от документа. Опишите ваши действия по регламенту." },
  b: { name: "Сервисный центр", module1: "Прием и диагностика", module2: "Выдача и эскалация",
    lessons: ["Знакомство с регламентом сервиса", "Прием обращения", "Диагностика и фиксация", "Выдача и спорные случаи"],
    question: "Клиент пришел за устройством без номера заявки. Опишите ваши действия по регламенту." },
};
const DEPTH: Record<Grade, string> = {
  junior: "Пошагово и с расшифровкой терминов.", middle: "Применение правила и типичные ошибки.",
  senior: "Краткая выжимка и исключения.", head: "Контрольные точки, риски процесса и действия руководителя.",
};

function course(label: "a" | "b", grade: Grade, chunkIds: string[], version = "") {
  const t = TOPICS[label];
  const lesson = (i: number, reading: boolean) => ({
    title: t.lessons[i]!, learning_outcome: `Сотрудник применяет раздел ${i + 1} демонстрационного регламента.`,
    content: `## ${t.lessons[i]}\n\n*Демонстрационный регламент.* ${DEPTH[grade]}\n\n1. Сверьте данные клиента с документом.\n2. Объясните следующий шаг.\n3. Зафиксируйте результат.\n\n| Роль | Действие |\n|---|---|\n| Сотрудник | выполняет и фиксирует |\n| Руководитель смены | решает исключения |`,
    requires_assessment: !reading, assessment_question: reading ? "" : t.question,
    source_chunk_ids: chunkIds.slice(0, 2), rubric: reading ? null : RUBRIC_FIXTURE,
    quiz: [{ question: "Что делается до операции?", correct_option_id: "a", explanation: "Сначала проверка по регламенту.",
      options: [{ id: "a", label: "Проверка документа" }, { id: "b", label: "Сразу операция" }] },
      { question: "Кто решает исключения?", correct_option_id: "b", explanation: "Исключения решает руководитель смены.",
        options: [{ id: "a", label: "Сотрудник сам" }, { id: "b", label: "Руководитель смены" }] }],
  });
  return { title: `${t.name}: стандарт ${grade[0]!.toUpperCase()}${grade.slice(1)}${version}`, target_grade: grade,
    description: `Демонстрационный курс для грейда ${grade}.`, objectives: ["Соблюдение демонстрационного регламента"], coverage_gaps: [],
    modules: [{ title: t.module1, description: "", lessons: [lesson(0, true), lesson(1, false)] },
      { title: t.module2, description: "", lessons: [lesson(2, false), lesson(3, false)] }] };
}

async function publishedCourse(admin: Db, hr: Db, tenantId: string, payload: ReturnType<typeof course>) {
  // Draft written by the service (as a generator would), published by the HR session.
  const id = must(await admin.from("courses").insert({ tenant_id: tenantId, title: payload.title, description: payload.description,
    target_grade: payload.target_grade, objectives: payload.objectives }).select("id").single(), "course").id;
  const course = must(await hr.from("courses").select("revision").eq("id", id).single(), "rev");
  const saved = must(await hr.rpc("save_course_draft", { p_course: id, p_expected_revision: course.revision,
    p_payload: { modules: payload.modules } as unknown as Json }), "save") as { revision: number };
  return { id, revision: saved.revision };
}

type Running = { attempt_id: string; lease_token: string };
const ANSWER = "Сначала проверю документ клиента и сверю данные заявки, затем объясню клиенту следующий шаг и запишу результат в журнал.";
async function attempt(admin: Db, emp: Db, assignment: string, lesson: string, c1: number, c2: number, opts: { fail?: string } = {}) {
  const started = must(await emp.rpc("begin_assessment", { p_assignment: assignment, p_lesson: lesson, p_request_key: randomUUID(), p_answer: ANSWER }), "begin") as Running;
  if (opts.fail) {
    const failed = await admin.rpc("fail_assessment", { p_attempt: started.attempt_id, p_lease: started.lease_token, p_code: opts.fail });
    if (failed.error) throw new Error(`fail: ${failed.error.message}`);
    return started.attempt_id;
  }
  must(await admin.rpc("finish_assessment", { p_attempt: started.attempt_id, p_lease: started.lease_token, p_execution_ms: 0,
    p_evaluation: { criteria: [{ id: "C1", points: c1, evidence: c1 ? "проверю документ клиента" : "", feedback: c1 ? "" : "Нет проверки документа." },
      { id: "C2", points: c2, evidence: c2 ? "объясню клиенту следующий шаг" : "", feedback: "" }],
      feedback: "Демонстрационная оценка (seed): сверьте ответ с регламентом." },
    p_meta: { source: "seed-fixture", model: "none", prompt_version: "seed" } }), "finish");
  // Cooldown between fixture attempts is simulated by back-dating (fixture-only).
  await admin.from("assessment_attempts").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", started.attempt_id);
  await admin.from("usage_daily").update({ minute_calls: 0 }).eq("agent_type", "assessor");
  return started.attempt_id;
}

async function main() {
  const remote = guard();
  const admin = serviceClient();
  if (remote) {
    const any = await admin.from("tenants").select("id", { count: "exact", head: true });
    if (any.error || (any.count ?? 0) > 0) throw new Error("Refusing to seed: hosted demo project must have no tenants.");
  }
  const existing = await admin.from("tenants").select("id").in("name", ["Demo Retail A", "Demo Service B"]);
  if (existing.data?.length) throw new Error("Already seeded. Run `npx supabase db reset` first (local only).");
  const pw = password();
  const creds: Record<string, unknown> = { note: "DEMO ONLY (synthetic). Do not commit or publish.", password: pw, accounts: {} as Record<string, string> };
  const accounts = creds.accounts as Record<string, string>;

  const saEmail = `superadmin@${DOMAIN}`;
  await createSuperadmin(admin, saEmail, pw);
  const sa = await signIn(saEmail, pw);
  const totpSecret = await enrollTotp(sa, (s) => totp(s));
  accounts.superadmin = saEmail;
  creds.superadmin_totp_secret = totpSecret;

  for (const [label, name, files] of [["a", "Demo Retail A", ["tests/fixtures/demo-retail-a.pdf"]], ["b", "Demo Service B", ["tests/fixtures/demo-service-b.pdf"]]] as const) {
    const hrEmail = `hr.${label}@${DOMAIN}`;
    const hrId = await createAuthUser(admin, hrEmail, pw);
    const tenantId = await provisionTenant(admin, hrId, name, { demo: true });
    await admin.from("users").update({ full_name: `HR ${label.toUpperCase()} (демо)` }).eq("id", hrId);
    accounts[`hr_${label}`] = hrEmail;
    const hr = await signIn(hrEmail, pw);
    const depNames = label === "a" ? ["Касса", "Торговый зал"] : ["Приемка", "Выдача"];
    const deps = [];
    for (const d of depNames) deps.push(must(await hr.rpc("create_department", { p_name: d }), "department"));
    const src = await source(admin, hr, tenantId, files[0], label === "a" ? "Регламент кассы (демо)" : "Регламент сервиса (демо)");
    await source(admin, hr, tenantId, "tests/fixtures/scan-no-text.pdf", "Скан без текстового слоя (демо)");

    const tracks: Record<string, string> = {};
    const courses: Record<string, string> = {};
    for (const g of GRADES) {
      const c = await publishedCourse(admin, hr, tenantId, course(label, g, src.chunkIds));
      must(await hr.rpc("publish_course", { p_course: c.id, p_expected_revision: c.revision }), "publish");
      courses[g] = c.id;
      tracks[g] = await publishTrack(hr, tenantId, `Трек ${TOPICS[label].name} ${g}`, g, [c.id]);
    }
    const draft = await publishedCourse(admin, hr, tenantId, course(label, "junior", src.chunkIds, " (черновик v2)"));
    void draft;

    const employees: { id: string; email: string; grade: Grade; assignment: string }[] = [];
    let n = 0;
    for (const g of GRADES) {
      for (let i = 1; i <= 3; i += 1) {
        n += 1;
        const email = `emp.${label}.${g}${i}@${DOMAIN}`;
        const id = await createEmployee(admin, tenantId, email, pw, g, deps[n % 2] ?? null, `Сотрудник ${label.toUpperCase()}-${g}-${i} (демо)`);
        const due = g === "middle" && i === 2 ? new Date(Date.now() - 3 * 86400000).toISOString() : new Date(Date.now() + 21 * 86400000).toISOString();
        const assignment = must(await hr.rpc("assign_track", { p_user: id, p_track: tracks[g]!, p_due_at: due }), "assign");
        employees.push({ id, email, grade: g, assignment });
        accounts[`emp_${label}_${g}${i}`] = email;
      }
    }

    // State fixtures (demo, clearly labelled source=seed-fixture).
    const lessons = (g: Grade) => lessonsOfCourse(admin, courses[g]!);
    const byKey = (g: Grade, i: number) => employees.find((e) => e.email === `emp.${label}.${g}${i}@${DOMAIN}`)!;
    const jl = await lessons("junior");
    const ml = await lessons("middle");
    const read = async (e: { email: string; assignment: string }, lesson: string) => {
      const db = await signIn(e.email, pw);
      must(await db.rpc("complete_reading", { p_assignment: e.assignment, p_lesson: lesson }).then((r) => ({ data: true, error: r.error })), "reading");
      return db;
    };
    const j1 = byKey("junior", 1);
    await attempt(admin, await read(j1, jl[0]!.id), j1.assignment, jl[1]!.id, 40, 60); // passed
    const j2 = byKey("junior", 2);
    const j2db = await read(j2, jl[0]!.id);
    const failedAttempt = await attempt(admin, j2db, j2.assignment, jl[1]!.id, 20, 60); // failed: critical missed
    must(await j2db.rpc("create_appeal", { p_attempt: failedAttempt, p_reason: "Я указал проверку документа, прошу пересмотреть критерий C1." }), "appeal");
    // junior3: locked lessons beyond the first (just assigned).
    const m1 = byKey("middle", 1);
    const m1db = await read(m1, ml[0]!.id);
    for (const l of ml.slice(1)) await attempt(admin, m1db, m1.assignment, l.id, 40, 60); // completed track
    const m3 = byKey("middle", 3);
    await attempt(admin, await read(m3, ml[0]!.id), m3.assignment, ml[1]!.id, 0, 0, { fail: "AI_BUSY" }); // provider_error

    // Billing fixtures: subscription snapshot + past-month activity → idempotent invoices.
    must(await admin.from("subscriptions").insert({ tenant_id: tenantId, status: "active", currency: "USD", tier: label === "a" ? "start" : "growth",
      seat_price_minor: label === "a" ? 600 : 500, minimum_monthly_minor: label === "a" ? 30000 : 100000, period_start: "2026-07-01",
      period_end: "2027-07-01", contract_snapshot: { reference: `DEMO-${label.toUpperCase()}`, price_list: "model-2026-10" } }).select("id"), "subscription");
    const months = ["2026-08-15T10:00:00+05:00", "2026-09-15T10:00:00+05:00"];
    const events = employees.flatMap((e, idx) => months.filter((_, mi) => mi === 1 || idx % 2 === 0).map((at) => ({
      tenant_id: tenantId, user_id: e.id, event_type: "lesson_engaged" as const, source_id: randomUUID(), occurred_at: at })));
    must(await admin.from("activity_events").insert(events).select("id"), "events");
    for (const ps of ["2026-08-01", "2026-09-01"]) {
      const a1 = must(await admin.rpc("generate_invoice", { p_tenant: tenantId, p_period_start: ps }), "invoice");
      const a2 = must(await admin.rpc("generate_invoice", { p_tenant: tenantId, p_period_start: ps }), "invoice repeat");
      if (a1 !== a2) throw new Error("invoice not idempotent");
      if (ps === "2026-08-01") must(await sa.rpc("mark_invoice_paid", { p_invoice: a1, p_reference: `DEMO-PAY-${label}-${ps}`,
        p_paid_at: "2026-09-05T09:00:00Z", p_reason: "Демонстрационная оплата (seed)" }).then((r) => ({ data: true, error: r.error })), "paid");
    }
    must(await admin.from("leads").insert({ email: `lead.${label}@${DOMAIN}`, company_name: `${name} (лид)`, status: "trial", tenant_id: tenantId,
      consent_at: new Date().toISOString(), qualification: { inputs: { baseline_hours: 1000, hourly_cost_usd: 10, automation_share: 0.8,
        control_hours: 100, cash_realization: 0.5, subscription_usd: 1500, implementation_usd: 3000 } } }).select("id"), "lead");
  }
  mkdirSync(".secrets", { recursive: true });
  const credsFile = process.env.SEED_CREDENTIALS_FILE?.trim() || ".secrets/seed-credentials.json";
  writeFileSync(credsFile, JSON.stringify(creds, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: "ok", tenants: 2, credentials_file: credsFile }));
}

main().catch((e: unknown) => {
  console.error(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
