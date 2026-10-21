import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { databaseError } from "@/lib/http";
import { likePattern, tableParams } from "@/lib/table";
import { PageHeader } from "@/components/shell/app-shell";
import { EmployeesClient, type EmployeeRow } from "@/components/hr/employees-client";

export const metadata: Metadata = { title: "Сотрудники" };
const SORTABLE = ["email", "grade", "created_at"] as const;

export default async function EmployeesPage({ searchParams }: PageProps<"/hr/employees">) {
  const ctx = await requireHr();
  const p = tableParams(await searchParams, SORTABLE, "email");
  let q = ctx.db.from("users").select("id,email,full_name,grade,status,department_id,created_at", { count: "exact" })
    .eq("tenant_id", ctx.tenantId).eq("role", "employee");
  if (p.q) q = q.or(`email.ilike.${likePattern(p.q)},full_name.ilike.${likePattern(p.q)}`);
  const users = await q.order(p.sort, { ascending: p.dir === "asc" }).range(p.from, p.to);
  if (users.error) databaseError(users.error);
  const ids = (users.data ?? []).map((u) => u.id);
  const [deps, assigns, tracks, invites] = await Promise.all([
    ctx.db.from("departments").select("id,name").eq("tenant_id", ctx.tenantId).order("name"),
    ctx.db.from("assignments").select("id,user_id,status,due_at,track_id,tracks(title,version)").in("user_id", ids).eq("status", "active"),
    ctx.db.from("tracks").select("id,title,version,target_grade").eq("tenant_id", ctx.tenantId).eq("status", "published").order("title"),
    ctx.db.from("invitations").select("id,email,target_grade,expires_at,accepted_at").eq("tenant_id", ctx.tenantId)
      .is("accepted_at", null).order("created_at", { ascending: false }).limit(50),
  ]);
  const assignmentIds = (assigns.data ?? []).map((a) => a.id);
  const progress = assignmentIds.length
    ? await ctx.db.from("progress").select("assignment_id,status").in("assignment_id", assignmentIds) : { data: [] };
  const rows: EmployeeRow[] = (users.data ?? []).map((u) => {
    const a = (assigns.data ?? []).find((x) => x.user_id === u.id);
    const pr = (progress.data ?? []).filter((x) => x.assignment_id === a?.id);
    const track = a?.tracks as { title: string; version: number } | null | undefined;
    return { id: u.id, email: u.email, fullName: u.full_name, grade: u.grade!, status: u.status as "active" | "suspended",
      departmentId: u.department_id, assignment: a ? { track: `${track?.title ?? "—"} v${track?.version ?? "?"}`, dueAt: a.due_at,
        completed: pr.filter((x) => x.status === "completed").length, total: pr.length } : null };
  });
  return (
    <>
      <PageHeader title="Сотрудники" description="Грейд, подразделение и статус меняет только HR; смена грейда отменяет активное назначение." />
      <EmployeesClient rows={rows} total={users.count ?? 0} page={p.page} pageSize={p.size} sort={p.sort} dir={p.dir}
        departments={deps.data ?? []} tracks={(tracks.data ?? []).map((t) => ({ ...t, target_grade: t.target_grade }))}
        pendingInvites={invites.data ?? []} />
    </>
  );
}
