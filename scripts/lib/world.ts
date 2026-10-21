// Shared fixture builder for integration tests and the local seed. Uses the service-role client
// only to prepare fixtures (Auth users, chunk rows); every business step that has a human gate
// (approve source, publish course/track, assign) runs through the HR's own user-scoped client.
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../lib/database.types";
import { TEST_EMBEDDING_MODEL, testEmbedding } from "./test-embedding";

export type Db = SupabaseClient<Database>;
export type Grade = Database["public"]["Enums"]["grade"];

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) throw new Error("CONFIG_MISSING: NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/SECRET_KEY");
  return { url, publishable, secret };
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function serviceClient(): Db {
  const { url, secret } = supabaseEnv();
  return createClient<Database>(url, secret, noPersist);
}

export function anonClient(): Db {
  const { url, publishable } = supabaseEnv();
  return createClient<Database>(url, publishable, noPersist);
}

export function must<T>(result: { data: T; error: { message: string } | null }, label: string): NonNullable<T> {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`${label}: no data`);
  return result.data as NonNullable<T>;
}

export async function createAuthUser(admin: Db, email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

export async function signIn(email: string, password: string): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

/** Enrolls and verifies a TOTP factor; the client session becomes AAL2. Returns the secret. */
export async function enrollTotp(client: Db, code: (secret: string) => string): Promise<string> {
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `t-${randomUUID().slice(0, 8)}` });
  if (enrolled.error || !enrolled.data) throw new Error(`mfa.enroll: ${enrolled.error?.message}`);
  const secret = enrolled.data.totp.secret;
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: code(secret) });
  if (verified.error) throw new Error(`mfa.verify: ${verified.error.message}`);
  return secret;
}

export async function verifyTotp(client: Db, code: (secret: string) => string, secret: string): Promise<void> {
  const factors = await client.auth.mfa.listFactors();
  const factor = factors.data?.totp[0];
  if (!factor) throw new Error("no totp factor");
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code(secret) });
  if (verified.error) throw new Error(`mfa.verify: ${verified.error.message}`);
}

export async function provisionTenant(admin: Db, authUserId: string, name: string, opts: { demo?: boolean } = {}) {
  const tenantId = must(await admin.rpc("provision_tenant", { p_auth_user: authUserId, p_name: name }), "provision_tenant");
  if (opts.demo) must(await admin.from("tenants").update({ is_demo: true }).eq("id", tenantId).select("id"), "mark demo");
  return tenantId;
}

/** Fixture shortcut: employee profile row created by the trusted service (invitation flow is tested separately). */
export async function createEmployee(admin: Db, tenantId: string, email: string, password: string, grade: Grade,
  departmentId: string | null = null, fullName = "") {
  const id = await createAuthUser(admin, email, password);
  must(await admin.from("users").insert({ id, tenant_id: tenantId, email, role: "employee", grade,
    department_id: departmentId, full_name: fullName }).select("id"), "insert employee");
  return id;
}

export async function createSuperadmin(admin: Db, email: string, password: string) {
  const id = await createAuthUser(admin, email, password);
  must(await admin.from("users").insert({ id, tenant_id: null, email, role: "superadmin", grade: null,
    full_name: "Superadmin" }).select("id"), "insert superadmin");
  return id;
}

export type SourceFixture = { documentId: string; chunkIds: string[] };

/** HR creates metadata + uploads bytes under its own session; the service stores chunks
 * (worker role); the HR approves the source under its own session (human gate). */
export async function createApprovedSource(admin: Db, hr: Db, tenantId: string, title: string,
  pages: string[], mime: "text/plain" | "application/pdf" = "text/plain", bytes?: Uint8Array): Promise<SourceFixture> {
  const documentId = randomUUID();
  const body = bytes ?? new TextEncoder().encode(pages.join("\f"));
  const sha256 = createHash("sha256").update(body).digest("hex");
  const objectPath = `${tenantId}/${documentId}/${randomUUID()}.${mime === "text/plain" ? "txt" : "pdf"}`;
  must(await hr.from("documents").insert({ id: documentId, tenant_id: tenantId, title, object_path: objectPath, sha256,
    original_filename: `${title}.${mime === "text/plain" ? "txt" : "pdf"}`, mime_type: mime, size_bytes: body.byteLength })
    .select("id"), "insert document");
  const upload = await hr.storage.from("knowledge").upload(objectPath, body, { contentType: mime, upsert: false });
  if (upload.error) throw new Error(`upload: ${upload.error.message}`);
  must(await admin.from("documents").update({ status: "processing" }).eq("id", documentId).select("id"), "processing");
  const rows = pages.map((content, i) => ({ tenant_id: tenantId, document_id: documentId, chunk_index: i, page: i + 1,
    content, embedding: testEmbedding(content), embedding_model: TEST_EMBEDDING_MODEL }));
  const chunks = must(await admin.from("document_chunks").insert(rows).select("id,chunk_index"), "insert chunks");
  must(await admin.from("documents").update({ status: "review", page_count: pages.length,
    char_count: pages.join("").length }).eq("id", documentId).select("id"), "review");
  const approved = await hr.rpc("approve_document", { p_document: documentId });
  if (approved.error) throw new Error(`approve_document: ${approved.error.message}`);
  return { documentId, chunkIds: chunks.sort((a, b) => a.chunk_index - b.chunk_index).map((c) => c.id) };
}

/** Rubric fixture from spec 6 step 6.5: C1 critical 40/40, C2 60/0, passing 80. */
export const RUBRIC_FIXTURE = {
  passing_score: 80,
  criteria: [
    { id: "C1", description: "Сверяет документ клиента с регламентом до операции", max_points: 40, critical: true,
      min_points: 40, reference: "Проверка документа до проведения операции" },
    { id: "C2", description: "Объясняет клиенту следующий шаг и фиксирует результат", max_points: 60, critical: false,
      min_points: 0, reference: "Понятное объяснение и запись результата" },
  ],
};

export function lessonPayload(opts: { title: string; reading?: boolean; chunkIds?: string[]; content?: string }) {
  return {
    title: opts.title,
    learning_outcome: `Сотрудник применяет правило «${opts.title}» в рабочей ситуации.`,
    content: opts.content ?? `## ${opts.title}\n\nДемонстрационный регламент. Порядок действий описан в источнике.`,
    requires_assessment: !opts.reading,
    assessment_question: opts.reading ? "" : `Опишите, как вы выполните «${opts.title}» по регламенту.`,
    source_chunk_ids: opts.chunkIds ?? [],
    rubric: opts.reading ? null : RUBRIC_FIXTURE,
    quiz: [
      { question: `Что делается первым в теме «${opts.title}»?`, correct_option_id: "a",
        explanation: "Сначала проверка по регламенту.",
        options: [{ id: "a", label: "Проверка по регламенту" }, { id: "b", label: "Сразу проведение операции" }] },
      { question: "Кто публикует учебный курс?", correct_option_id: "b", explanation: "Публикует уполномоченный HR.",
        options: [{ id: "a", label: "ИИ-методист" }, { id: "b", label: "HR после проверки" }] },
    ],
  };
}

/** Two modules, four lessons: first lesson is reading, the rest are assessed (spec 6 step 6.3). */
export function coursePayload(title: string, grade: Grade, chunkIds: string[]) {
  return {
    title, target_grade: grade, description: `Демонстрационный курс «${title}».`,
    objectives: ["Соблюдение демонстрационного регламента"], coverage_gaps: [],
    modules: [
      { title: "Модуль 1. Основы", description: "Общие правила.", lessons: [
        lessonPayload({ title: "Знакомство с регламентом", reading: true, chunkIds: chunkIds.slice(0, 1) }),
        lessonPayload({ title: "Проверка документов", chunkIds: chunkIds.slice(0, 2) }) ] },
      { title: "Модуль 2. Практика", description: "Применение правил.", lessons: [
        lessonPayload({ title: "Обслуживание клиента", chunkIds: chunkIds.slice(1, 2) }),
        lessonPayload({ title: "Фиксация результата", chunkIds: chunkIds.slice(0, 1) }) ] },
    ],
  };
}

export async function publishCourse(hr: Db, tenantId: string, payload: ReturnType<typeof coursePayload>) {
  const courseId = must(await hr.rpc("create_course_draft", { p_title: payload.title, p_grade: payload.target_grade,
    p_description: payload.description, p_tenant: tenantId }), "create_course_draft");
  const saved = must(await hr.rpc("save_course_draft", { p_course: courseId, p_expected_revision: 0,
    p_payload: payload as unknown as Json }), "save_course_draft") as { revision: number };
  must(await hr.rpc("publish_course", { p_course: courseId, p_expected_revision: saved.revision }), "publish_course");
  return courseId;
}

export async function publishTrack(hr: Db, tenantId: string, title: string, grade: Grade, courseIds: string[]) {
  const trackId = must(await hr.rpc("create_track_draft", { p_title: title, p_grade: grade, p_course_ids: courseIds,
    p_tenant: tenantId }), "create_track_draft");
  const track = must(await hr.from("tracks").select("revision").eq("id", trackId).single(), "track revision");
  must(await hr.rpc("publish_track", { p_track: trackId, p_expected_revision: track.revision }), "publish_track");
  return trackId;
}

export async function lessonsOfCourse(admin: Db, courseId: string) {
  const rows = must(await admin.from("lessons").select("id,order_index,requires_assessment,module_id")
    .eq("course_id", courseId).order("order_index"), "lessons");
  return rows;
}
