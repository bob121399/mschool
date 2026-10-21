import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { ReportRequest } from "@/components/hr/report-request";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateTime } from "@/lib/i18n/labels";
import { previousWeekStart } from "@/lib/time";

export const metadata: Metadata = { title: "Отчеты" };
type Ratio = { numerator: number; denominator: number };
type Metrics = { employees: number; assigned: number; active_learners: number; started: number; completed: number; overdue: number;
  median_hours_to_completion: number | null; first_attempt_pass_rate: Ratio; appeals: Ratio; ai_errors: number;
  departments: { department_id: string; name: string; employees: number; suppressed: boolean; locked: number | null; in_progress: number | null; completed: number | null }[] };
type Narrative = { status: string; reason?: string; executive_summary?: string; data_quality_flags?: string[];
  department_summaries?: { department_id: string; observations: string[]; risks: string[]; recommended_actions: string[] }[] };
const pct = (r: Ratio) => (r.denominator === 0 ? "N/A" : `${Math.round((r.numerator / r.denominator) * 100)}% (${r.numerator}/${r.denominator})`);

export default async function ReportsPage() {
  const ctx = await requireHr();
  const [reports, tenant] = await Promise.all([
    ctx.db.from("hr_reports").select("id,period_start,period_end,metrics,narrative,created_at").eq("tenant_id", ctx.tenantId)
      .order("period_start", { ascending: false }).limit(12),
    ctx.db.from("tenants").select("timezone").eq("id", ctx.tenantId).single(),
  ]);
  const tz = tenant.data?.timezone ?? "Asia/Tashkent";
  return (
    <>
      <PageHeader title="Отчеты HR" description={`Период — полная неделя (понедельник 00:00 → понедельник 00:00, ${tz}). Числа считает сервер; текст аналитика не создает новых показателей. Группы < 5 сотрудников не сравниваются.`} />
      <ReportRequest defaultWeek={previousWeekStart(new Date(), tz)} />
      <div className="mt-6 space-y-6">
        {(reports.data ?? []).length === 0 ? <EmptyState title="Отчетов пока нет" description="Сформируйте отчет за прошедшую неделю." /> : null}
        {(reports.data ?? []).map((r) => {
          const m = r.metrics as unknown as Metrics;
          const n = r.narrative as unknown as Narrative;
          return (
            <Card key={r.id} title={`Неделя ${formatDate(r.period_start, tz)} — ${formatDate(r.period_end, tz)}`} description={`Обновлено ${formatDateTime(r.created_at, tz)}`}>
              <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                {[["Сотрудников", m.employees], ["Назначено за период", m.assigned], ["Активные обучающиеся", m.active_learners], ["Начали", m.started],
                  ["Завершили треки", m.completed], ["Просрочено", m.overdue], ["Медиана до завершения, ч", m.median_hours_to_completion ?? "N/A"],
                  ["Сдали с 1-й попытки", pct(m.first_attempt_pass_rate)], ["Доля апелляций", pct(m.appeals)], ["Технические ошибки ИИ", m.ai_errors]].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{String(v)}</dd></div>
                ))}
              </dl>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm"><caption className="sr-only">Подразделения</caption>
                  <thead className="text-left"><tr><th scope="col" className="p-2">Подразделение</th><th scope="col" className="p-2">Сотрудников</th>
                    <th scope="col" className="p-2">Закрыто</th><th scope="col" className="p-2">В процессе</th><th scope="col" className="p-2">Завершено</th></tr></thead>
                  <tbody>{m.departments.map((d) => (
                    <tr key={d.department_id} className="border-t border-border"><td className="p-2">{d.name}</td><td className="p-2">{d.employees}</td>
                      {d.suppressed ? <td className="p-2 text-muted-foreground" colSpan={3}>Группа меньше 5 — сравнение скрыто</td>
                        : <><td className="p-2">{d.locked}</td><td className="p-2">{d.in_progress}</td><td className="p-2">{d.completed}</td></>}</tr>))}</tbody>
                </table>
              </div>
              <div className="mt-4">
                {n.status === "generated" ? (
                  <div className="space-y-2 text-sm"><p className="font-medium">Комментарий AI-аналитика</p><p>{n.executive_summary}</p>
                    {n.data_quality_flags?.length ? <p className="text-muted-foreground">Ограничения данных: {n.data_quality_flags.join("; ")}</p> : null}</div>
                ) : <Alert kind="info">Комментарий аналитика не сформирован: ИИ-провайдер не настроен. Показатели выше рассчитаны сервером.</Alert>}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
