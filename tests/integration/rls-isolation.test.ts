import { beforeAll, describe, expect, it } from "vitest";
import { buildWorld, CANARY_B, type World } from "../support/world-setup";
import { signIn } from "../../scripts/lib/world";

let w: World;
beforeAll(async () => { w = await buildWorld(); });

describe("SEC-01 HR A cannot read or change tenant B by UUID", () => {
  it("returns empty selects for B rows", async () => {
    const users = await w.a.hr.from("users").select("id").eq("id", w.b.hrId);
    expect(users.error).toBeNull();
    expect(users.data).toEqual([]);
    const courses = await w.a.hr.from("courses").select("id").eq("id", w.b.courseId);
    expect(courses.data).toEqual([]);
    const progress = await w.a.hr.from("progress").select("id").eq("tenant_id", w.b.tenantId);
    expect(progress.data).toEqual([]);
    const docs = await w.a.hr.from("documents").select("id").eq("id", w.b.documentId);
    expect(docs.data).toEqual([]);
  });

  it("cannot update or delete B rows and B state is unchanged", async () => {
    const upd = await w.a.hr.from("departments").insert({ tenant_id: w.b.tenantId, name: "evil" }).select("id");
    expect(upd.error).not.toBeNull();
    const ren = await w.a.hr.from("courses").update({ title: "hacked" }).eq("id", w.b.courseId).select("id");
    expect(ren.data ?? []).toEqual([]);
    const course = await w.admin.from("courses").select("title").eq("id", w.b.courseId).single();
    expect(course.data?.title).not.toBe("hacked");
    const assign = await w.a.hr.rpc("assign_track", { p_user: w.b.employees[0]!.id, p_track: w.a.trackId });
    expect(assign.error?.message).toBe("FORBIDDEN");
    const upEmp = await w.a.hr.rpc("update_employee", { p_user: w.b.employees[0]!.id, p_grade: "middle" });
    expect(upEmp.error?.message).toBe("NOT_FOUND");
    const emp = await w.admin.from("users").select("grade").eq("id", w.b.employees[0]!.id).single();
    expect(emp.data?.grade).toBe("junior");
  });

  it("cannot create invitations or drafts in tenant B", async () => {
    const inv = await w.a.hr.rpc("create_invitation", { p_tenant: w.b.tenantId, p_email: "x@example.com", p_grade: "junior" });
    expect(inv.error?.message).toBe("FORBIDDEN");
    const draft = await w.a.hr.rpc("create_course_draft", { p_title: "x", p_grade: "junior", p_tenant: w.b.tenantId });
    expect(draft.error?.message).toBe("FORBIDDEN");
  });
});

describe("SEC-02 role/tenant cannot be changed from the browser", () => {
  it("user_metadata role is ignored and users row cannot be updated", async () => {
    const emp = w.a.employees[0]!;
    const meta = await emp.db.auth.updateUser({ data: { role: "superadmin", tenant_id: w.b.tenantId } });
    expect(meta.error).toBeNull();
    const fresh = await signIn(emp.email, w.password);
    const own = await fresh.from("users").select("role,tenant_id").eq("id", emp.id).single();
    expect(own.data).toEqual({ role: "employee", tenant_id: w.a.tenantId });
    const self = await fresh.from("users").update({ role: "hr_admin" }).eq("id", emp.id).select("id");
    expect(self.error).not.toBeNull();
    const hrB = await fresh.from("users").select("id").eq("tenant_id", w.b.tenantId);
    expect(hrB.data).toEqual([]);
  });
});

describe("SEC-03 employee cannot write protected tables", () => {
  it("permission denied on direct writes", async () => {
    const db = w.a.employees[0]!.db;
    const lesson = w.a.lessons[1]!;
    const attempts = [
      db.from("progress").update({ status: "completed", completed_at: new Date().toISOString() }).eq("user_id", w.a.employees[0]!.id).select("id"),
      db.from("assessment_rubrics").insert({ tenant_id: w.a.tenantId, lesson_id: lesson.id, criteria: [] }).select("id"),
      db.from("invoices").select("id"),
      db.from("agent_audit_logs").insert({ tenant_id: w.a.tenantId, agent_type: "tutor", execution_time_ms: 0 }).select("id"),
      db.from("users").insert({ id: w.a.employees[0]!.id, email: "x@y.z", tenant_id: w.a.tenantId }).select("id"),
      db.from("activity_events").insert({ tenant_id: w.a.tenantId, user_id: w.a.employees[0]!.id, event_type: "lesson_engaged",
        source_id: lesson.id }).select("id"),
      db.from("subscriptions").insert({ tenant_id: w.a.tenantId, status: "active", currency: "USD", seat_price_minor: 0,
        minimum_monthly_minor: 0, period_start: "2026-01-01", period_end: "2026-02-01", contract_snapshot: {} }).select("id"),
    ];
    const results = await Promise.all(attempts);
    expect(results[0]!.error ?? results[0]!.data).toSatisfy((v: unknown) => Array.isArray(v) ? v.length === 0 : Boolean(v));
    for (const r of results.slice(1)) {
      if (r.error) continue;
      expect(r.data).toEqual([]);
    }
    const progress = await w.admin.from("progress").select("status").eq("user_id", w.a.employees[0]!.id).eq("status", "completed");
    expect(progress.data).toEqual([]);
    const events = await w.admin.from("activity_events").select("id").eq("user_id", w.a.employees[0]!.id).eq("event_type", "lesson_engaged");
    expect(events.data).toEqual([]);
  });
});

describe("SEC-04 no cross-tenant links", () => {
  it("rejects lesson_sources to a B chunk and draft payload with B chunk", async () => {
    const draftId = (await w.a.hr.rpc("create_course_draft", { p_title: "cross", p_grade: "junior", p_tenant: w.a.tenantId })).data!;
    const saved = await w.a.hr.rpc("save_course_draft", { p_course: draftId, p_expected_revision: 0, p_payload: {
      modules: [{ title: "m", lessons: [{ title: "l", content: "c", requires_assessment: false, source_chunk_ids: [w.b.chunkIds[0]!] }] }] } });
    expect(saved.error).not.toBeNull();
    const links = await w.admin.from("lesson_sources").select("lesson_id").eq("chunk_id", w.b.chunkIds[0]!).eq("tenant_id", w.a.tenantId);
    expect(links.data).toEqual([]);
    const track = await w.a.hr.rpc("create_track_draft", { p_title: "x", p_grade: "junior", p_course_ids: [w.b.courseId], p_tenant: w.a.tenantId });
    expect(track.error).not.toBeNull();
  });
});

describe("SEC-05 employee sees no locked content, rubric, raw file or vectors", () => {
  it("hides locked lessons, rubrics, quiz keys, chunks and storage objects", async () => {
    const db = w.a.employees[0]!.db;
    const locked = w.a.lessons[2]!;
    const lesson = await db.from("lessons").select("content").eq("id", locked.id);
    expect(lesson.data).toEqual([]);
    const open = await db.from("lessons").select("id").eq("id", w.a.lessons[0]!.id);
    expect(open.data).toHaveLength(1);
    expect((await db.from("assessment_rubrics").select("criteria")).data).toEqual([]);
    expect((await db.from("quiz_items").select("correct_option_id")).data).toEqual([]);
    expect((await db.from("document_chunks").select("content")).data).toEqual([]);
    expect((await db.from("documents").select("object_path")).data).toEqual([]);
    const doc = await w.admin.from("documents").select("object_path").eq("id", w.a.documentId).single();
    const download = await db.storage.from("knowledge").download(doc.data!.object_path);
    expect(download.data).toBeNull();
    const list = await db.storage.from("knowledge").list(w.a.tenantId);
    expect(list.data ?? []).toEqual([]);
  });

  it("roadmap manifest exposes no content for locked lessons", async () => {
    const res = await w.a.employees[0]!.db.rpc("roadmap_manifest", { p_assignment: w.a.assignments[0]! });
    expect(res.error).toBeNull();
    const rows = res.data as Record<string, unknown>[];
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["course_id", "course_order_index", "course_title",
      "lesson_id", "lesson_title", "module_id", "module_order_index", "module_title", "order_index", "score", "status"]);
  });

  it("practice questions are returned without the answer key", async () => {
    const res = await w.a.employees[0]!.db.rpc("practice_questions", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[0]!.id });
    expect(JSON.stringify(res.data)).not.toContain("correct_option_id");
  });
});

describe("SEC-06 retrieval is scoped to own assignment", () => {
  it("A cannot retrieve with B assignment/lesson and never sees the B canary", async () => {
    const db = w.a.employees[0]!.db;
    const probe = JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)));
    const cross = await db.rpc("match_lesson_chunks", { p_assignment: w.b.assignments[0]!, p_lesson: w.b.lessons[0]!.id,
      p_embedding: probe, p_model: "test-hash-embedding-v1", p_limit: 5 });
    expect(cross.error?.message).toBe("NOT_FOUND");
    const mixed = await db.rpc("match_lesson_chunks", { p_assignment: w.a.assignments[0]!, p_lesson: w.b.lessons[0]!.id,
      p_embedding: probe, p_model: "test-hash-embedding-v1", p_limit: 5 });
    expect(mixed.error?.message).toBe("NOT_FOUND");
    const own = await db.rpc("match_lesson_chunks", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[0]!.id,
      p_embedding: probe, p_model: "test-hash-embedding-v1", p_limit: 5 });
    expect(own.error).toBeNull();
    expect(own.data!.length).toBeGreaterThan(0);
    expect(JSON.stringify(own.data)).not.toContain(CANARY_B);
    const ctx = await db.rpc("lesson_context", { p_assignment: w.b.assignments[0]!, p_lesson: w.b.lessons[0]!.id });
    expect(ctx.error?.message).toBe("NOT_FOUND");
  });
});

describe("SEC-07 service-only functions are not executable by authenticated", () => {
  it("denies EXECUTE", async () => {
    const db = w.a.employees[0]!.db;
    const calls = await Promise.all([
      db.rpc("finish_assessment", { p_attempt: w.a.lessons[0]!.id, p_lease: w.a.lessons[0]!.id, p_evaluation: {}, p_meta: {}, p_execution_ms: 0 }),
      db.rpc("provision_tenant", { p_auth_user: w.a.employees[0]!.id, p_name: "x" }),
      db.rpc("fail_assessment", { p_attempt: w.a.lessons[0]!.id, p_lease: w.a.lessons[0]!.id, p_code: "X" }),
      db.rpc("record_tutor_exchange", { p_tenant: w.a.tenantId, p_user: w.a.employees[0]!.id, p_assignment: w.a.assignments[0]!,
        p_lesson: w.a.lessons[0]!.id, p_question: "q", p_answer: "a", p_citations: [], p_meta: {}, p_execution_ms: 0 }),
      db.rpc("claim_job", { p_types: ["ingestion"] }),
      w.a.hr.rpc("store_hr_report", { p_job: w.a.lessons[0]!.id, p_lease: w.a.lessons[0]!.id, p_metrics: {}, p_narrative: {} }),
      w.a.hr.rpc("hr_report_metrics", { p_tenant: w.a.tenantId, p_start: "2026-01-01", p_end: "2026-02-01" }),
    ]);
    for (const c of calls) {
      expect(c.error, JSON.stringify(c.data)).not.toBeNull();
      expect(c.error!.code).toBe("42501");
    }
    const anon = (await import("../../scripts/lib/world")).anonClient();
    const anonCall = await anon.rpc("begin_assessment", { p_assignment: w.a.assignments[0]!, p_lesson: w.a.lessons[1]!.id,
      p_request_key: w.a.lessons[1]!.id, p_answer: "x" });
    expect(anonCall.error?.code).toBe("42501");
  });
});

describe("SEC-10 superadmin global scope requires MFA", () => {
  it("AAL1 session sees nothing; AAL2 sees both tenants; published versions stay immutable", async () => {
    const aal1 = await signIn(w.superadmin.email, w.password);
    const weak = await aal1.from("tenants").select("id").in("id", [w.a.tenantId, w.b.tenantId]);
    expect(weak.data).toEqual([]);
    const strong = await w.superadmin.db.from("tenants").select("id").in("id", [w.a.tenantId, w.b.tenantId]);
    expect(strong.data).toHaveLength(2);
    const edit = await w.superadmin.db.from("courses").update({ title: "sa edit" }).eq("id", w.a.courseId).select("id");
    expect(edit.data ?? []).toEqual([]);
    const course = await w.admin.from("courses").select("title,status").eq("id", w.a.courseId).single();
    expect(course.data?.status).toBe("published");
    const weakUpdate = await aal1.rpc("admin_update_tenant", { p_tenant: w.a.tenantId, p_tier: "growth", p_reason: "проверка без MFA" });
    expect(weakUpdate.error?.message).toBe("FORBIDDEN");
  });
});

describe("SEC-11 published content is immutable; clone creates a new version", () => {
  it("rejects edits and deletes of published course, lesson, rubric, track and approved source", async () => {
    const hr = w.a.hr;
    const lessonId = w.a.lessons[1]!.id;
    const writes = await Promise.all([
      hr.from("lessons").update({ title: "changed" }).eq("id", lessonId).select("id"),
      hr.from("assessment_rubrics").update({ passing_score: 10 }).eq("lesson_id", lessonId).select("id"),
      hr.from("course_modules").delete().eq("course_id", w.a.courseId).select("id"),
      hr.from("tracks").update({ title: "changed" }).eq("id", w.a.trackId).select("id"),
      hr.from("documents").update({ title: "changed" }).eq("id", w.a.documentId).select("id"),
      hr.rpc("save_course_draft", { p_course: w.a.courseId, p_expected_revision: 1, p_payload: { title: "x" } }),
    ]);
    for (const r of writes) expect(r.error !== null || (Array.isArray(r.data) && r.data.length === 0)).toBe(true);
    // Even the owner path (service role, bypasses RLS) hits the immutability trigger.
    const svc = await w.admin.from("lessons").update({ title: "changed" }).eq("id", lessonId).select("id");
    expect(svc.error?.message).toBe("PUBLISHED_IMMUTABLE");
    const svcDoc = await w.admin.from("documents").update({ title: "changed" }).eq("id", w.a.documentId).select("id");
    expect(svcDoc.error?.message).toBe("SOURCE_IMMUTABLE");
    const lesson = await w.admin.from("lessons").select("title").eq("id", lessonId).single();
    expect(lesson.data?.title).not.toBe("changed");

    const cloneId = (await hr.rpc("clone_course", { p_course: w.a.courseId })).data!;
    const clone = await w.admin.from("courses").select("version,status,supersedes_id").eq("id", cloneId).single();
    expect(clone.data).toEqual({ version: 2, status: "draft", supersedes_id: w.a.courseId });
    const cloneLessons = await w.admin.from("lessons").select("id").eq("course_id", cloneId);
    expect(cloneLessons.data).toHaveLength(4);
    const oldIds = new Set(w.a.lessons.map((l) => l.id));
    for (const l of cloneLessons.data!) expect(oldIds.has(l.id)).toBe(false);
    const rubrics = await w.admin.from("assessment_rubrics").select("lesson_id").in("lesson_id", cloneLessons.data!.map((l) => l.id));
    expect(rubrics.data).toHaveLength(3);
    const again = (await hr.rpc("clone_course", { p_course: w.a.courseId })).data!;
    expect(again).toBe(cloneId);
  });
});

describe("SEC-12 suspended tenant loses access", () => {
  it("blocks employee reads and job side effects after suspension", async () => {
    const before = await w.b.employees[0]!.db.rpc("roadmap_manifest", { p_assignment: w.b.assignments[0]! });
    expect(before.error).toBeNull();
    const job = await w.b.hr.rpc("request_document_processing", { p_document: w.b.documentId });
    expect(job.error?.message).toBe("DOCUMENT_NOT_PROCESSABLE");
    const report = await w.b.hr.rpc("request_hr_report", { p_period_start: "2026-10-05" });
    expect(report.error).toBeNull();
    const claimed = await w.admin.rpc("claim_job", { p_types: ["hr_analyst"] });
    const mine = (claimed.data ?? []).find((j) => j.id === report.data);
    await w.admin.from("tenants").update({ status: "suspended" }).eq("id", w.b.tenantId);
    try {
      const after = await w.b.employees[0]!.db.rpc("roadmap_manifest", { p_assignment: w.b.assignments[0]! });
      expect(after.error?.message).toBe("NOT_FOUND");
      const profile = await w.b.hr.from("users").select("id").eq("id", w.b.hrId);
      expect(profile.data).toEqual([]);
      if (mine) {
        const store = await w.admin.rpc("store_hr_report", { p_job: mine.id, p_lease: mine.lease_token!, p_metrics: {}, p_narrative: {} });
        expect(store.error?.message).toBe("TENANT_INACTIVE");
        await w.admin.rpc("finish_job", { p_job: mine.id, p_lease: mine.lease_token!, p_status: "failed", p_result: {}, p_error: "TENANT_INACTIVE" });
      }
    } finally {
      await w.admin.from("tenants").update({ status: "trial" }).eq("id", w.b.tenantId);
    }
  });
});

describe("Superadmin before MFA", () => {
  it("reads only its own profile row (to be routed to MFA), nothing global", async () => {
    const aal1 = await signIn(w.superadmin.email, w.password);
    const own = await aal1.from("users").select("id,role");
    expect(own.data).toEqual([{ id: w.superadmin.id, role: "superadmin" }]);
  });
});

describe("Access state for routing (E-TS-19)", () => {
  it("distinguishes no profile, suspended user and inactive tenant without exposing data", async () => {
    const { createAuthUser } = await import("../../scripts/lib/world");
    const fresh = `noprofile-${w.run}@test.mschool.local`;
    await createAuthUser(w.admin, fresh, w.password);
    expect((await (await signIn(fresh, w.password)).rpc("my_access_state")).data).toBe("no_profile");
    const emp = w.a.employees[1]!;
    expect((await emp.db.rpc("my_access_state")).data).toBe("ok");
    await w.admin.from("users").update({ status: "suspended" }).eq("id", emp.id);
    expect((await emp.db.rpc("my_access_state")).data).toBe("user_suspended");
    await w.admin.from("users").update({ status: "active" }).eq("id", emp.id);
    await w.admin.from("tenants").update({ status: "suspended" }).eq("id", w.a.tenantId);
    expect((await emp.db.rpc("my_access_state")).data).toBe("tenant_inactive");
    await w.admin.from("tenants").update({ status: "trial" }).eq("id", w.a.tenantId);
  });
});
