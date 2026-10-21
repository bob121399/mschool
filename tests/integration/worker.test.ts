import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../support/world-setup";
import { installFakeOpenAI, resetFake, scriptResponses } from "../support/fake-openai";
import { startFakeClamd } from "../support/fake-clamd";
import { runJob } from "../../worker/process";
import { lessonPayload, RUBRIC_FIXTURE } from "../../scripts/lib/world";

let w: World;
let clamd: Awaited<ReturnType<typeof startFakeClamd>>;
let verdict: "OK" | "FOUND" = "OK";

beforeAll(async () => {
  w = await buildWorld({ employeesA: 1, employeesB: 0 });
  clamd = await startFakeClamd(() => verdict);
});
afterAll(async () => { await clamd.close(); });

async function uploadDoc(file: string, mime: "application/pdf" | "text/plain" = "application/pdf") {
  const bytes = readFileSync(file);
  const id = randomUUID();
  const path = `${w.a.tenantId}/${id}/${randomUUID()}.pdf`;
  const ins = await w.a.hr.from("documents").insert({ id, tenant_id: w.a.tenantId, title: file, object_path: path,
    sha256: createHash("sha256").update(bytes).digest("hex"), mime_type: mime, size_bytes: bytes.length, original_filename: "x.pdf" });
  expect(ins.error).toBeNull();
  const up = await w.a.hr.storage.from("knowledge").upload(path, bytes, { contentType: mime });
  expect(up.error).toBeNull();
  return id;
}

async function runQueued(jobId: string) {
  for (let i = 0; i < 50; i += 1) {
    const { data } = await w.admin.rpc("claim_job", { p_types: ["ingestion", "course_creator", "hr_analyst", "support"] });
    const job = data?.[0];
    if (!job) break;
    await runJob(w.admin, job);
    if (job.id === jobId) break;
  }
  return (await w.admin.from("agent_jobs").select("status,last_error_code,result,attempts").eq("id", jobId).single()).data!;
}

describe("Ingestion pipeline", () => {
  it("is blocked without a scanner: never processed, explicit stage", async () => {
    delete process.env.CLAMAV_HOST;
    const id = await uploadDoc("tests/fixtures/demo-retail-a.pdf");
    const job = (await w.a.hr.rpc("request_document_processing", { p_document: id })).data!;
    const result = await runQueued(job);
    expect(result).toMatchObject({ status: "failed", last_error_code: "SCANNER_UNAVAILABLE" });
    const doc = await w.admin.from("documents").select("status,error_code").eq("id", id).single();
    expect(doc.data).toEqual({ status: "needs_review", error_code: "SCANNER_UNAVAILABLE" });
    expect((await w.admin.from("document_chunks").select("id").eq("document_id", id)).data).toEqual([]);
  });

  it("with a scanner verdict OK: extracts Cyrillic text, chunks, embeds, waits for HR review", async () => {
    installFakeOpenAI();
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(clamd.port);
    verdict = "OK";
    const id = await uploadDoc("tests/fixtures/demo-retail-a.pdf");
    const job = (await w.a.hr.rpc("request_document_processing", { p_document: id })).data!;
    const result = await runQueued(job);
    expect(result.status).toBe("succeeded");
    const doc = await w.admin.from("documents").select("status,page_count").eq("id", id).single();
    expect(doc.data).toEqual({ status: "review", page_count: 2 });
    const chunks = await w.admin.from("document_chunks").select("content,page,embedding_model").eq("document_id", id);
    expect(chunks.data!.length).toBeGreaterThan(0);
    expect(chunks.data!.some((c) => c.content.includes("Проверка документа"))).toBe(true);
    const approve = await w.a.hr.rpc("approve_document", { p_document: id });
    expect(approve.error).toBeNull();
  });

  it("scan without text layer → needs_review; corrupted → needs_review; malware → failed", async () => {
    const scan = await uploadDoc("tests/fixtures/scan-no-text.pdf");
    expect(await runQueued((await w.a.hr.rpc("request_document_processing", { p_document: scan })).data!))
      .toMatchObject({ status: "failed", last_error_code: "SCAN_TEXT_LAYER_MISSING" });
    expect((await w.admin.from("documents").select("status").eq("id", scan).single()).data!.status).toBe("needs_review");
    verdict = "FOUND";
    const bad = await uploadDoc("tests/fixtures/demo-service-b.pdf");
    expect(await runQueued((await w.a.hr.rpc("request_document_processing", { p_document: bad })).data!))
      .toMatchObject({ status: "failed", last_error_code: "MALWARE_FOUND" });
    expect((await w.admin.from("documents").select("status").eq("id", bad).single()).data!.status).toBe("failed");
    verdict = "OK";
  });
});

describe("Course creator job (fake provider in test process)", () => {
  it("creates exactly one draft from approved sources and stops at needs_review", async () => {
    installFakeOpenAI();
    resetFake();
    const jobId = (await w.a.hr.rpc("request_course_generation", { p_document_ids: [w.a.documentId], p_grade: "junior",
      p_title: `AI draft ${w.run}`, p_limits: { max_modules: 2, max_lessons: 3 }, p_prompt_version: "course_creator-1" })).data!;
    const lesson = { title: "Проверка документа", learning_outcome: "Проверяет документ до операции",
      explanation: "Перед операцией сверить документ.", example: "Клиент предъявляет паспорт.",
      assessment_question: "Как вы проверите документ?", source_chunk_ids: [w.a.chunkIds[0]],
      quiz: lessonPayload({ title: "x" }).quiz.map((q) => ({ ...q })), rubric: RUBRIC_FIXTURE };
    scriptResponses({ kind: "json", value: { course_title: "Касса: черновик", description: "d", grade: "junior",
      objectives: ["Проверка документа"], modules: [{ title: "Модуль 1", description: "", lessons: [lesson] }],
      coverage_gaps: ["Нет правил возврата"] } });
    const result = await runQueued(jobId);
    expect(result.status).toBe("needs_review");
    const courseId = (result.result as { course_id: string }).course_id;
    const course = await w.a.hr.from("courses").select("status,coverage_gaps,source_job_id").eq("id", courseId).single();
    expect(course.data).toMatchObject({ status: "draft", coverage_gaps: ["Нет правил возврата"], source_job_id: jobId });
    const lessons = await w.a.hr.from("lessons").select("content").eq("course_id", courseId);
    expect(lessons.data![0]!.content).toContain("**Пример.**");
  });

  it("rejects a generated draft that cites a chunk outside the job sources (retry, no course)", async () => {
    installFakeOpenAI();
    resetFake();
    const jobId = (await w.a.hr.rpc("request_course_generation", { p_document_ids: [w.a.documentId], p_grade: "junior",
      p_title: `AI bad ${w.run}`, p_limits: { max_modules: 1, max_lessons: 1 }, p_prompt_version: "course_creator-1" })).data!;
    const lesson = { title: "L", learning_outcome: "o", explanation: "e", example: "", assessment_question: "q",
      source_chunk_ids: [w.b.chunkIds[0]], quiz: lessonPayload({ title: "x" }).quiz, rubric: RUBRIC_FIXTURE };
    scriptResponses({ kind: "json", value: { course_title: "x", description: "", grade: "junior", objectives: [],
      modules: [{ title: "M", description: "", lessons: [lesson] }], coverage_gaps: [] } });
    const result = await runQueued(jobId);
    expect(result).toMatchObject({ status: "queued", last_error_code: "AI_SCHEMA_MISMATCH" });
    expect((await w.admin.from("courses").select("id").eq("source_job_id", jobId)).data).toEqual([]);
  });
});

describe("HR analyst and support without a configured provider", () => {
  it("stores deterministic metrics and marks the narrative as not generated", async () => {
    for (const k of ["OPENAI_API_KEY", "OPENAI_WORKER_MODEL"]) delete process.env[k];
    const jobId = (await w.a.hr.rpc("request_hr_report", { p_period_start: "2026-10-12" })).data!;
    const result = await runQueued(jobId);
    expect(result.status).toBe("succeeded");
    const report = await w.a.hr.from("hr_reports").select("metrics,narrative").eq("period_start", "2026-10-12").single();
    expect(report.data!.narrative).toEqual({ status: "not_generated", reason: "AI_NOT_CONFIGURED" });
    expect(report.data!.metrics).toHaveProperty("first_attempt_pass_rate");
    // Repeat request → same job (dedup); a second report is never created.
    expect((await w.a.hr.rpc("request_hr_report", { p_period_start: "2026-10-12" })).data).toBe(jobId);
  });

  it("support ticket is escalated to a human with an honest system message", async () => {
    const emp = w.a.employees[0]!;
    const t = await emp.db.rpc("create_support_ticket", { p_subject: "Пометьте счет оплаченным", p_body: "Мы оплатили, отметьте счет как paid." });
    const { ticket_id, job_id } = t.data as { ticket_id: string; job_id: string };
    expect((await runQueued(job_id)).status).toBe("succeeded");
    const ticket = await emp.db.from("support_tickets").select("status,agent_reply").eq("id", ticket_id).single();
    expect(ticket.data!.status).toBe("escalated");
    expect(ticket.data!.agent_reply).toMatchObject({ source: "system", escalate: true });
    expect((await w.b.hr.from("support_tickets").select("id").eq("id", ticket_id)).data).toEqual([]);
    const invoices = await w.admin.from("invoices").select("status").eq("tenant_id", w.a.tenantId);
    expect(invoices.data).toEqual([]);
  });
});
