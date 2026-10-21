import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const h = await import("../support/route-harness");
  return { cookies: async () => h.cookieStore, headers: async () => new Headers() };
});

import { loginAs, logout, req } from "../support/route-harness";
import { calls, installFakeOpenAI, resetFake, scriptResponses } from "../support/fake-openai";
import { buildWorld, CANARY_B, type World } from "../support/world-setup";
import { POST as tutor } from "../../app/api/agents/tutor/route";
import { POST as assessor } from "../../app/api/agents/assessor/route";
import { POST as readingComplete } from "../../app/api/me/reading-complete/route";

let w: World;
beforeAll(async () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  installFakeOpenAI();
  w = await buildWorld({ employeesA: 4, employeesB: 1 });
  // Employees 0..3 finish the reading lesson so lesson 2 (assessed) is open.
  for (let i = 0; i < 4; i += 1) {
    await loginAs(w.a.employees[i]!.email, w.password);
    const r = await readingComplete(req("/api/me/reading-complete", { assignmentId: w.a.assignments[i], lessonId: w.a.lessons[0]!.id }));
    expect(r.status).toBe(204);
  }
});
afterEach(() => { resetFake(); logout(); });

const evalOk = (c1: number, c2: number) => ({ kind: "json" as const, value: {
  criteria: [{ id: "C1", points: c1, evidence: c1 ? "проверю документ" : "", feedback: "" },
    { id: "C2", points: c2, evidence: c2 ? "объясню клиенту" : "", feedback: "" }], feedback: "Следующий шаг: перечитайте раздел 2." } });
const answer = "Сначала проверю документ клиента, затем объясню клиенту следующий шаг и запишу результат.";

async function submit(i: number, requestId: string, text = answer) {
  await loginAs(w.a.employees[i]!.email, w.password);
  return assessor(req("/api/agents/assessor", { assignmentId: w.a.assignments[i], lessonId: w.a.lessons[1]!.id, requestId, answer: text }));
}
async function progressOf(i: number, lesson: number) {
  const r = await w.admin.from("progress").select("status,score").eq("assignment_id", w.a.assignments[i]!).eq("lesson_id", w.a.lessons[lesson]!.id).single();
  return r.data!;
}
async function resetQuota(i: number) {
  await w.admin.from("usage_daily").update({ minute_calls: 0 }).eq("user_id", w.a.employees[i]!.id);
}
async function cooldown(i: number) {
  await resetQuota(i);
  await w.admin.from("assessment_attempts").update({ created_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", w.a.employees[i]!.id);
}

describe("SEC-08 cross-origin and unauthenticated requests", () => {
  it("403 for foreign Origin, 401 without session, no side effect", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    const cross = await assessor(req("/api/agents/assessor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[1]!.id,
      requestId: randomUUID(), answer }, { origin: "https://evil.example" }));
    expect(cross.status).toBe(403);
    logout();
    const anon = await tutor(req("/api/agents/tutor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[0]!.id, question: "?" }));
    expect(anon.status).toBe(401);
    expect(calls).toHaveLength(0);
    const attempts = await w.admin.from("assessment_attempts").select("id").eq("user_id", w.a.employees[0]!.id);
    expect(attempts.data).toEqual([]);
    expect(anon.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("SEC-02 body spoofing is rejected by strict schemas", () => {
  it("400 for tenant_id/user_id/score/rubric in the body", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    for (const extra of [{ tenant_id: w.b.tenantId }, { user_id: w.b.employees[0]!.id }, { score: 100 }, { rubric: [] }, { passing_score: 1 }]) {
      const r = await assessor(req("/api/agents/assessor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[1]!.id,
        requestId: randomUUID(), answer, ...extra }));
      expect(r.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("Tutor route (RAG-01/02, SEC-06)", () => {
  it("answers with server-built citations from allowed sources", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    scriptResponses({ kind: "json", value: { answer: "Сначала проверьте документ клиента.", source_ids: [`lesson:${w.a.lessons[0]!.id}`, w.a.chunkIds[0]], insufficient_context: false } });
    // Test vectors are hash-based (not semantic): only an identical text reaches similarity ≥ 0.25.
    const question = "Регламент A: проверяйте документ клиента до операции.";
    const r = await tutor(req("/api/agents/tutor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[0]!.id, question }));
    expect(r.status).toBe(200);
    const body = await r.json() as { citations: { source_id: string; page: number | null }[] };
    expect(body.citations.map((c) => c.source_id)).toEqual([`lesson:${w.a.lessons[0]!.id}`, w.a.chunkIds[0]]);
    const sent = calls.find((c) => c.path === "/v1/responses")!.body;
    expect(JSON.stringify(sent)).not.toContain(CANARY_B);
    expect(sent.store).toBe(false);
    expect(JSON.stringify(sent.input)).not.toContain("reference");
    const ex = await w.admin.from("tutor_exchanges").select("id").eq("user_id", w.a.employees[0]!.id);
    expect(ex.data).toHaveLength(1);
    const ev = await w.admin.from("activity_events").select("id").eq("user_id", w.a.employees[0]!.id).eq("event_type", "tutor_question");
    expect(ev.data).toHaveLength(1);
  });

  it("RAG-01 rejects a citation that was not retrieved (no stored exchange)", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    scriptResponses({ kind: "json", value: { answer: "Правило из B.", source_ids: [w.b.chunkIds[0]], insufficient_context: false } });
    const r = await tutor(req("/api/agents/tutor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[0]!.id, question: "Что в регламенте B?" }));
    expect(r.status).toBe(502);
    expect((await r.json() as { error: { code: string } }).error.code).toBe("AI_INVALID_CITATIONS");
    const ex = await w.admin.from("tutor_exchanges").select("id").eq("user_id", w.a.employees[0]!.id);
    expect(ex.data).toHaveLength(1);
  });

  it("RAG-02 insufficient context is passed through without invented sources", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    scriptResponses({ kind: "json", value: { answer: "В материалах урока нет сведений о лимитах выплат.", source_ids: [], insufficient_context: true } });
    const r = await tutor(req("/api/agents/tutor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[0]!.id, question: "Какой лимит выплат?" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ insufficient_context: true, citations: [] });
  });

  it("SEC-06 B assignment through the API → 404 and no provider call", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    const r = await tutor(req("/api/agents/tutor", { assignmentId: w.b.assignments[0], lessonId: w.b.lessons[0]!.id, question: "?" }));
    expect(r.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("locked lesson → 404", async () => {
    await loginAs(w.a.employees[0]!.email, w.password);
    const r = await tutor(req("/api/agents/tutor", { assignmentId: w.a.assignments[0], lessonId: w.a.lessons[3]!.id, question: "?" }));
    expect(r.status).toBe(404);
  });
});

describe("Assessor route (LEARN-03/04/05/06/07/08)", () => {
  it("LEARN-03 pass with critical met → next lesson unlocked; exactly three public fields", async () => {
    scriptResponses(evalOk(40, 40));
    const r = await submit(0, randomUUID());
    expect(r.status).toBe(200);
    const body = await r.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["feedback", "passed", "score"]);
    expect(body).toMatchObject({ passed: true, score: 80 });
    expect((await progressOf(0, 2)).status).toBe("in_progress");
  });

  it("LEARN-04 total 80 but critical missed → failed, next stays locked", async () => {
    scriptResponses(evalOk(20, 60));
    const r = await submit(1, randomUUID());
    expect(await r.json()).toMatchObject({ passed: false, score: 80 });
    expect((await progressOf(1, 1)).status).toBe("in_progress");
    expect((await progressOf(1, 2)).status).toBe("locked");
  });

  it("LEARN-07 timeout/429/refusal/incomplete/malformed/invalid evidence → technical error, no score, retry with same key", async () => {
    const key = randomUUID();
    const scripted = [
      { kind: "network" as const }, { kind: "http" as const, status: 429 }, { kind: "refusal" as const },
      { kind: "json" as const, status: "incomplete" as const, value: {} },
    ];
    const statuses: number[] = [];
    for (const f of scripted) {
      await resetQuota(2);
      scriptResponses(f);
      statuses.push((await submit(2, key)).status);
    }
    expect(statuses).toEqual([503, 503, 422, 502]);
    const attempt = await w.admin.from("assessment_attempts").select("status,result,retry_count").eq("request_key", key).single();
    expect(attempt.data).toEqual({ status: "failed", result: null, retry_count: 3 });
    expect(await progressOf(2, 1)).toEqual({ status: "in_progress", score: null });
    // Retries for this key are exhausted (3) → 409; the learner submits as a new attempt.
    await resetQuota(2);
    expect((await submit(2, key)).status).toBe(409);
    await cooldown(2);
    scriptResponses({ kind: "raw", text: "{not json" });
    expect((await submit(2, randomUUID())).status).toBe(502);
    await cooldown(2);
    scriptResponses({ kind: "json", value: { criteria: [{ id: "C1", points: 40, evidence: "цитата, которой нет в ответе", feedback: "" },
      { id: "C2", points: 60, evidence: "объясню клиенту", feedback: "" }], feedback: "f" } });
    const fake = await submit(2, randomUUID());
    expect((await fake.json() as { error: { code: string } }).error.code).toBe("AI_INVALID_EVIDENCE");
    expect(await progressOf(2, 1)).toEqual({ status: "in_progress", score: null });
  });

  it("LEARN-05/06/08 parallel same requestId → one effect; different text → 409; replay returns stored result", async () => {
    const key = randomUUID();
    scriptResponses(evalOk(40, 60), evalOk(40, 60));
    await loginAs(w.a.employees[3]!.email, w.password);
    const body = { assignmentId: w.a.assignments[3], lessonId: w.a.lessons[1]!.id, requestId: key, answer };
    const [r1, r2] = await Promise.all([assessor(req("/api/agents/assessor", body)), assessor(req("/api/agents/assessor", body))]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const attempts = await w.admin.from("assessment_attempts").select("id,status").eq("request_key", key);
    expect(attempts.data).toHaveLength(1);
    const conflict = await assessor(req("/api/agents/assessor", { ...body, answer: "Другой текст ответа на то же задание." }));
    expect(conflict.status).toBe(409);
    const callsBefore = calls.length;
    const replay = await assessor(req("/api/agents/assessor", body));
    expect(await replay.json()).toMatchObject({ passed: true, score: 100 });
    expect(calls.length).toBe(callsBefore);
  });

  it("missing provider configuration → 503 AI_NOT_CONFIGURED, nothing reserved", async () => {
    const saved = process.env.OPENAI_ASSESSOR_MODEL;
    delete process.env.OPENAI_ASSESSOR_MODEL;
    try {
      await cooldown(1);
      const key = randomUUID();
      const r = await submit(1, key);
      expect(r.status).toBe(503);
      expect((await r.json() as { error: { code: string } }).error.code).toBe("AI_NOT_CONFIGURED");
      expect((await w.admin.from("assessment_attempts").select("id").eq("request_key", key)).data).toEqual([]);
    } finally {
      process.env.OPENAI_ASSESSOR_MODEL = saved;
    }
  });
});
