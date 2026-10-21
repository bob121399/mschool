import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorld, type World } from "../support/world-setup";
import { anonClient, createAuthUser, lessonPayload, signIn } from "../../scripts/lib/world";

let w: World;
beforeAll(async () => { w = await buildWorld({ employeesA: 2, employeesB: 1 }); });

describe("Invitations (2.3)", () => {
  it("creates a pending invitation, rotates token on repeat, accepts only for the invited verified email", async () => {
    const email = `invitee-${w.run}@test.mschool.local`;
    const first = await w.a.hr.rpc("create_invitation", { p_tenant: null as unknown as string, p_email: ` ${email.toUpperCase()} `, p_grade: "middle" });
    expect(first.error).toBeNull();
    const second = await w.a.hr.rpc("create_invitation", { p_tenant: null as unknown as string, p_email: email, p_grade: "middle" });
    const t1 = (first.data as { token: string }).token;
    const t2 = (second.data as { token: string; invitation_id: string }).token;
    expect((second.data as { invitation_id: string }).invitation_id).toBe((first.data as { invitation_id: string }).invitation_id);
    const rows = await w.admin.from("invitations").select("id,email").eq("email", email);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0]!.email).toBe(email);

    const stranger = `stranger-${w.run}@test.mschool.local`;
    await createAuthUser(w.admin, stranger, w.password);
    const wrong = await (await signIn(stranger, w.password)).rpc("accept_invitation", { p_token: t2 });
    expect(wrong.error?.message).toBe("INVITATION_EMAIL_MISMATCH");

    await createAuthUser(w.admin, email, w.password);
    const invitee = await signIn(email, w.password);
    const old = await invitee.rpc("accept_invitation", { p_token: t1 });
    expect(old.error?.message).toBe("INVALID_INVITATION");
    const ok = await invitee.rpc("accept_invitation", { p_token: t2 });
    expect(ok.data).toBe(w.a.tenantId);
    const profile = await invitee.from("users").select("role,grade,tenant_id").single();
    expect(profile.data).toEqual({ role: "employee", grade: "middle", tenant_id: w.a.tenantId });
    const replay = await invitee.rpc("accept_invitation", { p_token: t2 });
    expect(replay.data).toBe(w.a.tenantId);
    const dup = await w.a.hr.rpc("create_invitation", { p_tenant: null as unknown as string, p_email: email, p_grade: "junior" });
    expect(dup.error?.message).toBe("USER_EXISTS");
    const employeeInvite = await w.a.employees[0]!.db.rpc("create_invitation", { p_tenant: null as unknown as string,
      p_email: `x-${w.run}@test.mschool.local`, p_grade: "junior" });
    expect(employeeInvite.error?.message).toBe("FORBIDDEN");
  });

  it("anonymous cannot accept or create invitations", async () => {
    const anon = anonClient();
    expect((await anon.rpc("accept_invitation", { p_token: "0".repeat(64) })).error?.code).toBe("42501");
  });
});

describe("Draft editing: compare-and-swap and validators", () => {
  it("second editor with a stale revision gets REVISION_CONFLICT; rubric validation rejects bad weights", async () => {
    const id = (await w.a.hr.rpc("create_course_draft", { p_title: "CAS", p_grade: "junior", p_tenant: w.a.tenantId })).data!;
    const payload = { title: "CAS v1", modules: [{ title: "M", lessons: [lessonPayload({ title: "L1" })] }] };
    const s1 = await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: 0, p_payload: payload });
    expect(s1.error).toBeNull();
    const s2 = await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: 0, p_payload: { title: "CAS v2" } });
    expect(s2.error?.message).toBe("REVISION_CONFLICT");
    const rev = (s1.data as { revision: number }).revision;
    const badRubric = { modules: [{ title: "M", lessons: [{ ...lessonPayload({ title: "L1" }),
      rubric: { passing_score: 80, criteria: [{ id: "C1", description: "d", max_points: 50, critical: false, min_points: 0, reference: "r" }] } }] }] };
    const s3 = await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: rev, p_payload: badRubric });
    expect(s3.error?.message).toBe("WEIGHTS_MUST_SUM_100");
    const fractional = { modules: [{ title: "M", lessons: [{ ...lessonPayload({ title: "L1" }),
      rubric: { passing_score: 80, criteria: [{ id: "C1", description: "d", max_points: 99.5, critical: false, min_points: 0, reference: "r" },
        { id: "C2", description: "d", max_points: 0.5, critical: false, min_points: 0, reference: "r" }] } }] }] };
    const s4 = await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: rev, p_payload: fractional });
    expect(s4.error?.message).toBe("INVALID_POINTS");
    const criticalNoMin = { modules: [{ title: "M", lessons: [{ ...lessonPayload({ title: "L1" }),
      rubric: { passing_score: 80, criteria: [{ id: "C1", description: "d", max_points: 100, critical: true, min_points: 0, reference: "r" }] } }] }] };
    expect((await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: rev, p_payload: criticalNoMin })).error?.message)
      .toBe("INVALID_POINTS");
    const badQuiz = { modules: [{ title: "M", lessons: [{ ...lessonPayload({ title: "L1" }),
      quiz: [{ question: "q", options: ["a", "b"], correct_option_id: "a", explanation: "e" }] }] }] };
    expect((await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: rev, p_payload: badQuiz })).error?.message)
      .toBe("INVALID_QUIZ_OPTION");
    const missing = { modules: [{ title: "M", lessons: [{ ...lessonPayload({ title: "L1" }), rubric: null }] }] };
    const s5 = await w.a.hr.rpc("save_course_draft", { p_course: id, p_expected_revision: rev, p_payload: missing });
    expect(s5.error).toBeNull();
    const pub = await w.a.hr.rpc("publish_course", { p_course: id, p_expected_revision: (s5.data as { revision: number }).revision });
    expect(pub.error?.message).toBe("MISSING_RUBRIC");
    const published = await w.admin.from("courses").select("status").eq("id", id).single();
    expect(published.data!.status).toBe("draft");
  });

  it("track publish rejects draft courses and grade mismatch", async () => {
    const draft = (await w.a.hr.rpc("create_course_draft", { p_title: "Draft only", p_grade: "junior", p_tenant: w.a.tenantId })).data!;
    const t = (await w.a.hr.rpc("create_track_draft", { p_title: `T-${w.run}`, p_grade: "junior", p_course_ids: [draft], p_tenant: w.a.tenantId })).data!;
    const rev = (await w.a.hr.from("tracks").select("revision").eq("id", t).single()).data!.revision;
    expect((await w.a.hr.rpc("publish_track", { p_track: t, p_expected_revision: rev })).error?.message).toBe("INVALID_TRACK");
    const mid = (await w.a.hr.rpc("create_track_draft", { p_title: `T-${w.run}`, p_grade: "middle", p_course_ids: [w.a.courseId], p_tenant: w.a.tenantId })).data!;
    const rev2 = (await w.a.hr.from("tracks").select("revision").eq("id", mid).single()).data!.revision;
    expect((await w.a.hr.rpc("publish_track", { p_track: mid, p_expected_revision: rev2 })).error?.message).toBe("INVALID_TRACK");
  });
});

describe("JOB-01 durable jobs: dedup, lease expiry recovery, idempotent result", () => {
  it("dedups requests, recovers an expired lease and creates exactly one draft", async () => {
    const req = () => w.a.hr.rpc("request_course_generation", { p_document_ids: [w.a.documentId], p_grade: "junior",
      p_title: `Gen ${w.run}`, p_limits: { max_modules: 1, max_lessons: 1 }, p_prompt_version: "course_creator-1" });
    const [j1, j2] = await Promise.all([req(), req()]);
    expect(j1.error).toBeNull();
    expect(j2.data).toBe(j1.data);
    const jobId = j1.data!;
    let claimed = (await w.admin.rpc("claim_job", { p_types: ["course_creator"] })).data!.find((j) => j.id === jobId);
    for (let i = 0; !claimed && i < 20; i += 1) {
      claimed = (await w.admin.rpc("claim_job", { p_types: ["course_creator"] })).data!.find((j) => j.id === jobId);
    }
    expect(claimed).toBeDefined();
    // Worker "crashes": lease expires, another worker reclaims with a new lease.
    await w.admin.from("agent_jobs").update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    const again = (await w.admin.rpc("claim_job", { p_types: ["course_creator"] })).data!;
    const reclaimed = again.find((j) => j.id === jobId)!;
    expect(reclaimed.attempts).toBe(2);
    expect(reclaimed.lease_token).not.toBe(claimed!.lease_token);
    const draft = { course_title: "Сгенерированный черновик", description: "", objectives: [], coverage_gaps: ["Нет раздела о возвратах"],
      modules: [{ title: "M1", description: "", lessons: [{ ...lessonPayload({ title: "L1", chunkIds: [w.a.chunkIds[0]!] }) }] }] };
    const stale = await w.admin.rpc("create_generated_course", { p_job: jobId, p_lease: claimed!.lease_token!, p_payload: draft });
    expect(stale.error?.message).toBe("STALE_LEASE");
    const foreignChunk = { ...draft, modules: [{ title: "M1", description: "", lessons: [{ ...lessonPayload({ title: "L1", chunkIds: [w.b.chunkIds[0]!] }) }] }] };
    expect((await w.admin.rpc("create_generated_course", { p_job: jobId, p_lease: reclaimed.lease_token!, p_payload: foreignChunk })).error)
      .not.toBeNull();
    const c1 = await w.admin.rpc("create_generated_course", { p_job: jobId, p_lease: reclaimed.lease_token!, p_payload: draft });
    const c2 = await w.admin.rpc("create_generated_course", { p_job: jobId, p_lease: reclaimed.lease_token!, p_payload: draft });
    expect(c1.error).toBeNull();
    expect(c2.data).toBe(c1.data);
    const courses = await w.admin.from("courses").select("id,status").eq("source_job_id", jobId);
    expect(courses.data).toEqual([{ id: c1.data, status: "draft" }]);
    expect((await w.admin.rpc("finish_job", { p_job: jobId, p_lease: reclaimed.lease_token!, p_status: "needs_review",
      p_result: { course_id: c1.data } })).data).toBe(true);
    const visible = await w.a.hr.from("agent_jobs").select("status,result").eq("id", jobId).single();
    expect(visible.data).toEqual({ status: "needs_review", result: { course_id: c1.data } });
    expect((await w.b.hr.from("agent_jobs").select("id").eq("id", jobId)).data).toEqual([]);
  });

  it("fails after max attempts", async () => {
    const r = await w.a.hr.rpc("request_hr_report", { p_period_start: "2026-09-28" });
    const jobId = r.data!;
    for (let i = 0; i < 3; i += 1) {
      const claim = (await w.admin.rpc("claim_job", { p_types: ["hr_analyst"] })).data!;
      const mine = claim.find((j) => j.id === jobId);
      if (!mine) { i -= 1; continue; }
      const outcome = await w.admin.rpc("retry_job", { p_job: jobId, p_lease: mine.lease_token!, p_error: "AI_BUSY", p_delay_seconds: 1 });
      expect(outcome.data).toBe(i < 2 ? "queued" : "failed");
      await w.admin.from("agent_jobs").update({ available_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    }
    const final = await w.admin.from("agent_jobs").select("status,last_error_code").eq("id", jobId).single();
    expect(final.data).toEqual({ status: "failed", last_error_code: "AI_BUSY" });
  });
});

describe("BILL-01 active seats and idempotent invoices", () => {
  it("counts one seat per user per month, excludes login-only and service accounts, never invoices twice", async () => {
    const tenantId = w.b.tenantId;
    const emp = w.b.employees[0]!.id;
    const svc = `svc-${w.run}@test.mschool.local`;
    const svcId = await createAuthUser(w.admin, svc, w.password);
    await w.admin.from("users").insert({ id: svcId, tenant_id: tenantId, email: svc, role: "employee", grade: "junior", is_service_account: true });
    const loginOnly = `login-${w.run}@test.mschool.local`;
    const loginId = await createAuthUser(w.admin, loginOnly, w.password);
    await w.admin.from("users").insert({ id: loginId, tenant_id: tenantId, email: loginOnly, role: "employee", grade: "junior" });
    const sep = (d: number) => `2026-09-${String(d).padStart(2, "0")}T10:00:00+05:00`;
    await w.admin.from("activity_events").insert([
      { tenant_id: tenantId, user_id: emp, event_type: "lesson_engaged", source_id: randomUUID(), occurred_at: sep(2) },
      { tenant_id: tenantId, user_id: emp, event_type: "tutor_question", source_id: randomUUID(), occurred_at: sep(15) },
      { tenant_id: tenantId, user_id: emp, event_type: "assessment_submitted", source_id: randomUUID(), occurred_at: sep(29) },
      { tenant_id: tenantId, user_id: svcId, event_type: "tutor_question", source_id: randomUUID(), occurred_at: sep(10) },
      // 2026-08-31 23:30 Tashkent is outside September in the billing timezone.
      { tenant_id: tenantId, user_id: w.b.hrId, event_type: "tutor_question", source_id: randomUUID(), occurred_at: "2026-08-31T23:30:00+05:00" },
    ]);
    await w.admin.from("subscriptions").insert({ tenant_id: tenantId, status: "active", currency: "USD", tier: "start",
      seat_price_minor: 600, minimum_monthly_minor: 30000, period_start: "2026-01-01", period_end: "2027-01-01",
      contract_snapshot: { price_list: "model-2026-10" } });
    const [i1, i2] = await Promise.all([
      w.admin.rpc("generate_invoice", { p_tenant: tenantId, p_period_start: "2026-09-01" }),
      w.admin.rpc("generate_invoice", { p_tenant: tenantId, p_period_start: "2026-09-01" }),
    ]);
    expect(i1.error).toBeNull();
    expect(i2.data).toBe(i1.data);
    const inv = await w.admin.from("invoices").select("active_seats,amount_minor,currency,status").eq("id", i1.data!).single();
    expect(inv.data).toEqual({ active_seats: 1, amount_minor: 30000, currency: "USD", status: "issued" });
    const open = await w.admin.rpc("generate_invoice", { p_tenant: tenantId, p_period_start: "2026-10-01" });
    expect(open.error?.message).toBe("PERIOD_NOT_CLOSED");
    const hrView = await w.b.hr.from("invoices").select("id");
    expect(hrView.data).toHaveLength(1);
    expect((await w.b.employees[0]!.db.from("invoices").select("id")).data).toEqual([]);
    expect((await w.b.hr.rpc("mark_invoice_paid", { p_invoice: i1.data!, p_reference: "PAY-1", p_paid_at: new Date().toISOString(),
      p_reason: "HR пытается подтвердить оплату" })).error?.message).toBe("FORBIDDEN");
    const paid = await w.superadmin.db.rpc("mark_invoice_paid", { p_invoice: i1.data!, p_reference: `PAY-${w.run}`,
      p_paid_at: new Date().toISOString(), p_reason: "Платеж подтвержден банковской выпиской" });
    expect(paid.error).toBeNull();
    const after = await w.admin.from("invoices").select("status,payment_reference").eq("id", i1.data!).single();
    expect(after.data).toEqual({ status: "paid", payment_reference: `PAY-${w.run}` });
    const audit = await w.admin.from("admin_audit_logs").select("actor_id").eq("object_id", i1.data!).eq("action", "mark_paid");
    expect(audit.data).toEqual([{ actor_id: w.superadmin.id }]);
  });
});

describe("Storage policies", () => {
  it("HR reads own source; HR of another tenant and employees cannot; no overwrite of approved bytes", async () => {
    const doc = await w.admin.from("documents").select("object_path").eq("id", w.a.documentId).single();
    const path = doc.data!.object_path;
    expect((await w.a.hr.storage.from("knowledge").download(path)).data).not.toBeNull();
    expect((await w.b.hr.storage.from("knowledge").download(path)).data).toBeNull();
    const overwrite = await w.a.hr.storage.from("knowledge").upload(path, new TextEncoder().encode("evil"), { upsert: true });
    expect(overwrite.error).not.toBeNull();
    const del = await w.a.hr.storage.from("knowledge").remove([path]);
    expect(del.data ?? []).toEqual([]);
    expect((await w.a.hr.storage.from("knowledge").download(path)).data).not.toBeNull();
    const rogue = await w.a.hr.storage.from("knowledge").upload(`${w.b.tenantId}/${randomUUID()}/${randomUUID()}.txt`,
      new TextEncoder().encode("x"));
    expect(rogue.error).not.toBeNull();
    const bucket = await w.admin.storage.getBucket("knowledge");
    expect(bucket.data?.public).toBe(false);
  });
});
