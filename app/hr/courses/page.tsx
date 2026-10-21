import Link from "next/link";
import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { databaseError } from "@/lib/http";
import { PageHeader } from "@/components/shell/app-shell";
import { CoursesActions } from "@/components/hr/courses-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, gradeLabel, type Grade } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Курсы" };

export default async function CoursesPage() {
  const ctx = await requireHr();
  const [courses, docs, jobs] = await Promise.all([
    ctx.db.from("courses").select("id,title,target_grade,version,status,updated_at,supersedes_id,source_job_id")
      .eq("tenant_id", ctx.tenantId).order("title").order("version", { ascending: false }).limit(200),
    ctx.db.from("documents").select("id,title").eq("tenant_id", ctx.tenantId).eq("status", "approved").order("title"),
    ctx.db.from("agent_jobs").select("id").eq("tenant_id", ctx.tenantId).eq("agent_type", "course_creator")
      .order("created_at", { ascending: false }).limit(3),
  ]);
  if (courses.error) databaseError(courses.error);
  const rows = courses.data ?? [];
  return (
    <>
      <PageHeader title="Курсы" description="Опубликованная версия неизменяема. Изменения — через «Создать новую версию»; старые назначения остаются на прежней версии." />
      <CoursesActions approvedDocs={docs.data ?? []} recentJobs={(jobs.data ?? []).map((j) => j.id)} />
      <div className="mt-6">
        {rows.length === 0 ? <EmptyState title="Курсов пока нет" description="Запустите методиста по подтвержденному источнику или создайте пустой черновик." /> : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Курсы и версии</caption>
              <thead className="bg-muted text-left"><tr><th scope="col" className="p-3">Курс</th><th scope="col" className="p-3">Грейд</th>
                <th scope="col" className="p-3">Версия</th><th scope="col" className="p-3">Статус</th><th scope="col" className="p-3">Изменен</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3"><Link className="font-medium hover:underline" href={`/hr/courses/${c.id}/edit`}>{c.title}</Link>
                      {c.source_job_id ? <span className="ml-2 text-xs text-muted-foreground">от методиста</span> : null}</td>
                    <td className="p-3">{gradeLabel(c.target_grade as Grade)}</td>
                    <td className="p-3 tabular-nums">v{c.version}</td>
                    <td className="p-3"><Badge tone={c.status === "published" ? "success" : "neutral"}>{c.status === "published" ? "Опубликован" : "Черновик"}</Badge></td>
                    <td className="p-3 whitespace-nowrap">{formatDateTime(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
