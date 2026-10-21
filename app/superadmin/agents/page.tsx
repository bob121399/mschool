import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jobStatusLabels } from "@/lib/i18n/labels";
import { aiConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Агенты и задачи" };
const AGENTS = [
  ["sales", "Sales & Onboarding", "Квалификация лида; ROI считает код"], ["support", "Support & Billing", "Ответ или эскалация; не меняет платежи"],
  ["product_analyst", "Product Analyst", "Только allowlist SQL-шаблонов"], ["course_creator", "Методист", "Только черновики из подтвержденных источников"],
  ["tutor", "Тьютор", "Ответы по открытому уроку с проверенными ссылками"], ["assessor", "Оценщик", "Баллы по критериям; итог считает SQL"],
  ["hr_analyst", "HR-аналитик", "Комментарий к серверным метрикам"],
] as const;

export default async function AgentsPage() {
  const ctx = await requireSuperadmin();
  const [jobs, audit] = await Promise.all([
    ctx.db.from("agent_jobs").select("id,agent_type,status,attempts,last_error_code,created_at,tenants(name)").order("created_at", { ascending: false }).limit(50),
    ctx.db.from("agent_audit_logs").select("agent_type,execution_time_ms,created_at,payload").order("created_at", { ascending: false }).limit(500),
  ]);
  const stats = new Map<string, { runs: number; ms: number; noUsage: number }>();
  for (const a of audit.data ?? []) {
    const s = stats.get(a.agent_type) ?? { runs: 0, ms: 0, noUsage: 0 };
    s.runs += 1; s.ms += a.execution_time_ms;
    const p = a.payload as { usage?: unknown };
    if (p.usage === undefined || p.usage === null) s.noUsage += 1;
    stats.set(a.agent_type, s);
  }
  return (
    <>
      <PageHeader title="Агенты и задачи" description={aiConfigured() ? "ИИ-провайдер настроен." : "ИИ-провайдер не настроен: агенты возвращают AI_NOT_CONFIGURED; детерминированные части работают."} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {AGENTS.map(([id, name, scope]) => {
          const s = stats.get(id);
          return (
            <Card key={id} title={name} description={scope}>
              <p className="text-sm">Запусков (последние 500 записей): {s?.runs ?? 0}</p>
              <p className="text-sm text-muted-foreground">Средняя длительность: {s?.runs ? `${Math.round(s.ms / s.runs)} мс` : "—"}</p>
              {s?.noUsage ? <p className="text-xs text-warning">Без данных usage: {s.noUsage} (стоимость неизвестна)</p> : null}
            </Card>
          );
        })}
      </div>
      <Card className="mt-6" title="Последние фоновые задачи">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Задачи</caption>
          <thead className="text-left"><tr><th scope="col" className="p-2">Тип</th><th scope="col" className="p-2">Компания</th><th scope="col" className="p-2">Статус</th><th scope="col" className="p-2">Попыток</th><th scope="col" className="p-2">Код</th><th scope="col" className="p-2">Создана</th></tr></thead>
          <tbody>{(jobs.data ?? []).map((j) => (
            <tr key={j.id} className="border-t border-border"><td className="p-2">{j.agent_type}</td><td className="p-2">{(j.tenants as { name: string } | null)?.name ?? "платформа"}</td>
              <td className="p-2"><Badge tone={j.status === "failed" ? "danger" : "neutral"}>{jobStatusLabels[j.status]}</Badge></td><td className="p-2">{j.attempts}</td>
              <td className="p-2 text-xs">{j.last_error_code ?? "—"}</td><td className="p-2 whitespace-nowrap">{new Date(j.created_at).toLocaleString("ru-RU")}</td></tr>))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
