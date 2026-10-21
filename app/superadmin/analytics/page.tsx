import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { ANALYTICS_TEMPLATES } from "@/lib/analytics";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnalyticsForm } from "@/components/superadmin/analytics-form";
import { jobStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Аналитика" };

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  return { defaultStart: start.toISOString().slice(0, 10), defaultEnd: end.toISOString().slice(0, 10) };
}

export default async function AnalyticsPage() {
  const ctx = await requireSuperadmin();
  const jobs = await ctx.db.from("agent_jobs").select("id,status,payload,result,last_error_code,created_at").eq("agent_type", "product_analyst")
    .order("created_at", { ascending: false }).limit(10);
  return (
    <>
      <PageHeader title="Продуктовая аналитика" description="Только параметризованные SQL-шаблоны из allowlist (timeout 5 с, ≤1000 строк, группы ≥5). Модель не пишет SQL и не видит персональных данных." />
      <AnalyticsForm templates={Object.entries(ANALYTICS_TEMPLATES).map(([id, t]) => ({ id, title: t.title }))}
        {...defaultRange()} />
      <div className="mt-6 space-y-4">
        {(jobs.data ?? []).map((j) => {
          const p = j.payload as { template_id: string; period_start: string; period_end: string };
          const r = j.result as { data?: { rows?: unknown[] }; report?: { status: string; observations?: { metric_id: string; value: number | null; denominator: number | null; interpretation: string }[]; hypotheses?: { statement: string }[] } } | null;
          const t = ANALYTICS_TEMPLATES[p.template_id];
          return (
            <Card key={j.id} title={`${t?.title ?? p.template_id}: ${p.period_start} — ${p.period_end}`} actions={<Badge>{jobStatusLabels[j.status]}</Badge>}>
              <details className="text-sm"><summary className="cursor-pointer">Показать расчет</summary>
                <p className="mt-1">Шаблон: <code>{p.template_id}</code>. {t?.definition}</p></details>
              {r?.data?.rows ? <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(r.data.rows, null, 2)}</pre> : null}
              {r?.report?.status === "generated" ? (
                <ul className="mt-2 list-disc pl-5 text-sm">{r.report.observations?.map((o, i) => <li key={i}>{o.metric_id}: {o.value ?? "N/A"} / {o.denominator ?? "N/A"} — {o.interpretation}</li>)}
                  {r.report.hypotheses?.map((h, i) => <li key={`h${i}`}>Гипотеза: {h.statement}</li>)}</ul>
              ) : r?.report ? <p className="mt-2 text-sm text-muted-foreground">Интерпретация не сформирована: ИИ-провайдер не настроен.</p> : null}
              {j.last_error_code ? <p className="text-sm text-danger">{j.last_error_code}</p> : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
