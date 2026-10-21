import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../support/world-setup";
import type { Db } from "../../scripts/lib/world";

let w: World;
beforeAll(async () => { w = await buildWorld({ employeesA: 6, employeesB: 1 }); });

type Running = { state: "running"; attempt_id: string; lease_token: string };
const evaluation = (c1: number, c2: number) => ({
  criteria: [
    { id: "C1", points: c1, evidence: c1 > 0 ? "проверю документ" : "", feedback: "" },
    { id: "C2", points: c2, evidence: c2 > 0 ? "объясню клиенту" : "", feedback: "" },
  ],
  feedback: "Следующий шаг: сверить ответ с регламентом.",
});

async function completeReading(db: Db, i: number) {
  const r = await db.rpc("complete_reading", { p_assignment: w.a.assignments[i]!, p_lesson: w.a.lessons[0]!.id });
  expect(r.error).toBeNull();
}
async function begin(db: Db, i: number, key: string, answer = "Я проверю документ и объясню клиенту следующий шаг.") {
  return db.rpc("begin_assessment", { p_assignment: w.a.assignments[i]!, p_lesson: w.a.lessons[1]!.id,
    p_request_key: key, p_answer: answer });
}
async function statuses(i: number) {
  const r = await w.admin.from("progress").select("lesson_id,status,score").eq("assignment_id", w.a.assignments[i]!);
  return new Map(r.data!.map((p) => [p.lesson_id, p]));
}

describe("LEARN-01 fixed track assignment", () => {
  it("opens only the first lesson; grade matches the track", async () => {
    const s = await statuses(0);
    expect(s.get(w.a.lessons[0]!.id)?.status).toBe("in_progress");
    for (const l of w.a.lessons.slice(1)) expect(s.get(l.id)?.status).toBe("locked");
    const middle = await w.a.hr.rpc("update_employee", { p_user: w.a.employees[5]!.id, p_grade: "middle" });
    expect(middle.error).toBeNull();
    const wrongGrade = await w.a.hr.rpc("assign_track", { p_user: w.a.employees[5]!.id, p_track: w.a.trackId });
    expect(wrongGrade.error?.message).toBe("INVALID_TRACK");
  });
});

describe("LEARN-02 reading completion cannot bypass assessment", () => {
  it("rejects complete_reading for an assessed lesson", async () => {
    await completeReading(w.a.employees[0]!.db, 0);
    const r = await w.a.employees[0]!.db.rpc("complete_reading", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[1]!.id });
    expect(r.error?.message).toBe("ASSESSMENT_REQUIRED");
    expect((await statuses(0)).get(w.a.lessons[1]!.id)?.status).toBe("in_progress");
  });
});

describe("LEARN-03/04 deterministic scoring and critical gate (rubric fixture)", () => {
  const cases: [number, number, number, boolean][] = [[1, 40, 60, true], [2, 20, 60, false], [3, 40, 20, false]];
  for (const [i, c1, c2, passed] of cases) {
    it(`C1=${c1} C2=${c2} → passed=${passed}`, async () => {
      const db = w.a.employees[i]!.db;
      await completeReading(db, i);
      const started = await begin(db, i, randomUUID());
      expect(started.error).toBeNull();
      const run = started.data as Running;
      const done = await w.admin.rpc("finish_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token,
        p_evaluation: evaluation(c1, c2), p_meta: { trace_id: "t" }, p_execution_ms: 5 });
      expect(done.error).toBeNull();
      expect(done.data).toMatchObject({ passed, score: c1 + c2 });
      const s = await statuses(i);
      expect(s.get(w.a.lessons[1]!.id)?.status).toBe(passed ? "completed" : "in_progress");
      expect(s.get(w.a.lessons[2]!.id)?.status).toBe(passed ? "in_progress" : "locked");
      const audit = await w.admin.from("agent_audit_logs").select("payload").eq("agent_type", "assessor")
        .eq("actor_id", w.a.employees[i]!.id);
      expect(audit.data!.some((a) => (a.payload as { attempt_id?: string }).attempt_id === run.attempt_id)).toBe(true);
    });
  }

  it("rejects model output with wrong ids, out-of-range or fractional points", async () => {
    const db = w.a.employees[4]!.db;
    await completeReading(db, 4);
    const run = (await begin(db, 4, randomUUID())).data as Running;
    const bad = [
      { criteria: [{ id: "C1", points: 40, evidence: "", feedback: "" }], feedback: "f" },
      { criteria: [{ id: "C1", points: 41, evidence: "", feedback: "" }, { id: "C2", points: 0, evidence: "", feedback: "" }], feedback: "f" },
      { criteria: [{ id: "C1", points: 39.5, evidence: "", feedback: "" }, { id: "C2", points: 0, evidence: "", feedback: "" }], feedback: "f" },
      { criteria: [{ id: "C1", points: 40, evidence: "", feedback: "" }, { id: "C9", points: 60, evidence: "", feedback: "" }], feedback: "f" },
    ];
    for (const ev of bad) {
      const r = await w.admin.rpc("finish_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token,
        p_evaluation: ev, p_meta: {}, p_execution_ms: 1 });
      expect(r.error).not.toBeNull();
    }
    expect((await statuses(4)).get(w.a.lessons[1]!.id)?.status).toBe("in_progress");
    await w.admin.rpc("fail_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token, p_code: "TEST" });
  });
});

describe("LEARN-05/06/08/09 idempotency, concurrency and leases", () => {
  it("concurrent submissions with one requestId create one attempt", async () => {
    const db = w.a.employees[0]!.db;
    const key = randomUUID();
    const results = await Promise.all([begin(db, 0, key), begin(db, 0, key), begin(db, 0, key)]);
    const ok = results.filter((r) => !r.error);
    expect(ok).toHaveLength(1);
    for (const r of results.filter((x) => x.error)) expect(r.error!.message).toBe("IN_PROGRESS");
    const attempts = await w.admin.from("assessment_attempts").select("id").eq("request_key", key);
    expect(attempts.data).toHaveLength(1);
    const run = ok[0]!.data as Running;

    // LEARN-06: same key, different text → conflict, original kept.
    const conflict = await begin(db, 0, key, "Совсем другой ответ на задание.");
    expect(conflict.error?.message).toBe("IDEMPOTENCY_CONFLICT");

    // LEARN-09: an old lease cannot commit after a new lease was issued.
    await w.admin.from("assessment_attempts").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("id", run.attempt_id);
    const retried = await begin(db, 0, key);
    expect(retried.error).toBeNull();
    const fresh = retried.data as Running;
    expect(fresh.lease_token).not.toBe(run.lease_token);
    const stale = await w.admin.rpc("finish_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token,
      p_evaluation: evaluation(0, 0), p_meta: {}, p_execution_ms: 1 });
    expect(stale.error?.message).toBe("STALE_LEASE");
    const done = await w.admin.rpc("finish_assessment", { p_attempt: fresh.attempt_id, p_lease: fresh.lease_token,
      p_evaluation: evaluation(40, 60), p_meta: {}, p_execution_ms: 1 });
    expect(done.data).toMatchObject({ passed: true, score: 100 });

    // LEARN-08: response lost after commit → same key returns the stored result, no new event.
    const eventsBefore = await w.admin.from("activity_events").select("id", { count: "exact", head: true })
      .eq("user_id", w.a.employees[0]!.id);
    const replay = await begin(db, 0, key);
    expect(replay.data).toMatchObject({ state: "succeeded", result: { passed: true, score: 100 } });
    const eventsAfter = await w.admin.from("activity_events").select("id", { count: "exact", head: true })
      .eq("user_id", w.a.employees[0]!.id);
    expect(eventsAfter.count).toBe(eventsBefore.count);
    const status = await db.rpc("attempt_status", { p_request_key: key });
    expect(status.data).toMatchObject({ status: "succeeded", result: { passed: true } });
    expect(JSON.stringify(status.data)).not.toContain("lease");
  });

  it("LEARN-07 provider failure is a technical error, not a failed learner result", async () => {
    const db = w.a.employees[2]!.db; // failed once in LEARN-04 → lesson still in progress
    await w.admin.from("assessment_attempts").update({ created_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("user_id", w.a.employees[2]!.id);
    const key = randomUUID();
    const run = (await begin(db, 2, key)).data as Running;
    const failed = await w.admin.rpc("fail_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token, p_code: "AI_BUSY" });
    expect(failed.error).toBeNull();
    const s = await statuses(2);
    expect(s.get(w.a.lessons[1]!.id)).toMatchObject({ status: "in_progress" });
    const attempt = await w.admin.from("assessment_attempts").select("status,result,error_code").eq("id", run.attempt_id).single();
    expect(attempt.data).toEqual({ status: "failed", result: null, error_code: "AI_BUSY" });
    const retry = await begin(db, 2, key);
    expect(retry.error).toBeNull();
    await w.admin.rpc("fail_assessment", { p_attempt: run.attempt_id, p_lease: (retry.data as Running).lease_token, p_code: "AI_BUSY" });
  });

  it("enforces cooldown between new attempts", async () => {
    const db = w.a.employees[3]!.db; // attempted moments ago in LEARN-04
    const r = await begin(db, 3, randomUUID());
    expect(r.error?.message).toBe("RATE_LIMIT");
  });
});

describe("LEARN-11 appeal with human override", () => {
  it("keeps the original result, records override and unlocks in one transaction", async () => {
    const emp = w.a.employees[3]!; // failed with 40+20
    const attempt = await w.admin.from("assessment_attempts").select("id,result").eq("user_id", emp.id).eq("status", "succeeded").single();
    const foreign = await w.b.employees[0]!.db.rpc("create_appeal", { p_attempt: attempt.data!.id, p_reason: "Не согласен с оценкой ответа" });
    expect(foreign.error?.message).toBe("NOT_FOUND");
    const appeal = await emp.db.rpc("create_appeal", { p_attempt: attempt.data!.id, p_reason: "Я описал объяснение клиенту полностью." });
    expect(appeal.error).toBeNull();
    const again = await emp.db.rpc("create_appeal", { p_attempt: attempt.data!.id, p_reason: "Повторная апелляция по тому же ответу" });
    expect(again.data).toMatchObject({ created: false });
    const appealId = (appeal.data as { appeal_id: string }).appeal_id;
    const otherHr = await w.b.hr.rpc("resolve_appeal", { p_appeal: appealId, p_decision: "overturned", p_reason: "Чужой HR пытается решить",
      p_override_passed: true, p_override_score: 90 });
    expect(otherHr.error?.message).toBe("NOT_FOUND");
    const noReason = await w.a.hr.rpc("resolve_appeal", { p_appeal: appealId, p_decision: "overturned", p_reason: "",
      p_override_passed: true, p_override_score: 90 });
    expect(noReason.error?.message).toBe("REASON_REQUIRED");
    const resolved = await w.a.hr.rpc("resolve_appeal", { p_appeal: appealId, p_decision: "overturned",
      p_reason: "Ответ содержит объяснение клиенту; критерий C2 выполнен.", p_override_passed: true, p_override_score: 90 });
    expect(resolved.error).toBeNull();
    const original = await w.admin.from("assessment_attempts").select("result").eq("id", attempt.data!.id).single();
    expect(original.data!.result).toEqual(attempt.data!.result);
    const override = await w.admin.from("assessment_overrides").select("reviewer_id,passed,score").eq("attempt_id", attempt.data!.id).single();
    expect(override.data).toEqual({ reviewer_id: w.a.hrId, passed: true, score: 90 });
    const s = await statuses(3);
    expect(s.get(w.a.lessons[1]!.id)?.status).toBe("completed");
    expect(s.get(w.a.lessons[2]!.id)?.status).toBe("in_progress");
    const audit = await w.admin.from("admin_audit_logs").select("action,actor_id").eq("object_id", appealId);
    expect(audit.data).toEqual([{ action: "resolve_appeal", actor_id: w.a.hrId }]);
    const seen = await emp.db.from("assessment_overrides").select("score");
    expect(seen.data).toEqual([{ score: 90 }]);
  });
});

describe("LEARN-12 track completion does not change grade", () => {
  it("completes the assignment, keeps grade", async () => {
    const i = 1; // passed lesson 2 in LEARN-03
    for (const lesson of w.a.lessons.slice(2)) {
      await w.admin.from("assessment_attempts").update({ created_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("user_id", w.a.employees[i]!.id);
      const r = await w.a.employees[i]!.db.rpc("begin_assessment", { p_assignment: w.a.assignments[i]!, p_lesson: lesson.id,
        p_request_key: randomUUID(), p_answer: "Я проверю документ и объясню клиенту следующий шаг." });
      expect(r.error).toBeNull();
      const run = r.data as Running;
      await w.admin.rpc("finish_assessment", { p_attempt: run.attempt_id, p_lease: run.lease_token,
        p_evaluation: evaluation(40, 60), p_meta: {}, p_execution_ms: 1 });
    }
    const a = await w.admin.from("assignments").select("status,completed_at").eq("id", w.a.assignments[i]!).single();
    expect(a.data!.status).toBe("completed");
    const u = await w.admin.from("users").select("grade").eq("id", w.a.employees[i]!.id).single();
    expect(u.data!.grade).toBe("junior");
  });
});

describe("Lesson engagement session (server token, ≥30 s, one-time)", () => {
  it("rejects early, records once after 30 s, blocks token reuse by others", async () => {
    const db = w.a.employees[0]!.db;
    const started = await db.rpc("start_lesson_session", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[0]!.id });
    expect(started.error).toBeNull();
    const { token, session_id } = started.data as { token: string; session_id: string };
    expect((await db.rpc("record_lesson_engagement", { p_token: token })).error?.message).toBe("TOO_EARLY");
    await w.admin.from("lesson_sessions").update({ started_at: new Date(Date.now() - 31_000).toISOString() }).eq("id", session_id);
    const stolen = await w.a.employees[4]!.db.rpc("record_lesson_engagement", { p_token: token });
    expect(stolen.error?.message).toBe("NOT_FOUND");
    expect((await db.rpc("record_lesson_engagement", { p_token: token })).data).toEqual({ recorded: true });
    expect((await db.rpc("record_lesson_engagement", { p_token: token })).data).toMatchObject({ recorded: false });
    const ev = await w.admin.from("activity_events").select("id").eq("source_id", session_id);
    expect(ev.data).toHaveLength(1);
    const locked = await db.rpc("start_lesson_session", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[3]!.id });
    expect(locked.error?.message).toBe("NOT_FOUND");
  });
});

describe("Grade change cancels assignment; re-assignment allowed (E-SQL-05)", () => {
  it("cancels active assignment and allows a new one later", async () => {
    const emp = w.a.employees[4]!;
    await w.a.hr.rpc("update_employee", { p_user: emp.id, p_grade: "middle" });
    const cancelled = await w.admin.from("assignments").select("status").eq("id", w.a.assignments[4]!).single();
    expect(cancelled.data!.status).toBe("cancelled");
    await w.a.hr.rpc("update_employee", { p_user: emp.id, p_grade: "junior" });
    const again = await w.a.hr.rpc("assign_track", { p_user: emp.id, p_track: w.a.trackId });
    expect(again.error).toBeNull();
    expect(again.data).not.toBe(w.a.assignments[4]);
  });
});
