import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { platformMetrics } from "@/lib/billing/platform";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, MetricCard } from "@/components/ui/card";
import { formatMoney } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Платформа" };

function lastClosedMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default async function SuperadminHome({ searchParams }: PageProps<"/superadmin">) {
  const ctx = await requireSuperadmin();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/u.test(sp.month) ? sp.month : lastClosedMonth();
  const currency = sp.currency === "UZS" ? "UZS" : "USD";
  const m = await platformMetrics(ctx.db, month, currency);
  const period = `Закрытый месяц ${month}, ${currency}; срез ${new Date(m.cutoff).toLocaleString("ru-RU")}`;
  const money = (v: number | null) => (v === null ? null : formatMoney(v, currency));
  const pct = (v: number | null) => (v === null ? "N/A" : `${(v * 100).toFixed(1)}%`);
  return (
    <>
      <PageHeader title="Показатели платформы" description="Выручка — только из выставленных/оплаченных счетов; demo-компании исключены; валюты не суммируются без сохраненной FX-конвертации." />
      <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">Месяц<input type="month" name="month" defaultValue={month} className="min-h-11 rounded-lg border border-border bg-surface px-3" /></label>
        <label className="flex flex-col gap-1 text-sm">Валюта<select name="currency" defaultValue={currency} className="min-h-11 rounded-lg border border-border bg-surface px-3"><option>USD</option><option>UZS</option></select></label>
        <button className="min-h-11 rounded-lg border border-border px-4 hover:bg-muted">Показать</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="MRR" value={money(m.mrr_minor)} period={period} definition="Сумма регулярных счетов закрытого месяца (issued/paid), нормализованная на месяц; trial, one-off и demo исключены." />
        <MetricCard label="ARR (run-rate)" value={money(m.arr_minor)} period={period} definition="12 × MRR. Это run-rate, не фактическая годовая выручка." />
        <MetricCard label="Платящие компании" value={String(m.paying_tenants)} period={period} definition="Компании с регулярным счетом в месяце." />
        <MetricCard label="Активные места" value={m.active_seats === null ? null : String(m.active_seats)} period={period} definition="Сумма active_seats счетов месяца: уникальные пользователи с серверным учебным событием." />
        <MetricCard label="NRR" value={pct(m.nrr)} period={`${month} к предыдущему месяцу`} definition="(MRR начала + expansion − contraction − churn) / MRR начала; новые клиенты исключены. Цель 120% — на 12 месяцев." />
        <MetricCard label="GRR" value={pct(m.grr)} period={`${month} к предыдущему месяцу`} definition="Удержание без expansion." />
        <MetricCard label="Задачи в очереди" value={String(m.jobs_pending)} period="сейчас" definition="agent_jobs в статусах queued/running." />
        <MetricCard label="Ошибки ИИ-проверки" value={String(m.ai_errors_month)} period={`за ${month}`} definition="Попытки оценивания с технической ошибкой провайдера (не оценки учеников)." />
      </div>
      <Card className="mt-6" title="Мост MRR" description="start → new → expansion → contraction → churn → end. Gross margin не показывается: ставки AI с датой действия не заданы (неизвестная ставка ≠ нулевая себестоимость).">
        {m.bridge ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-6">
            {([["Начало", m.bridge.start], ["Новые", m.bridge.new], ["Expansion", m.bridge.expansion], ["Contraction", -m.bridge.contraction], ["Churn", -m.bridge.churn], ["Конец", m.bridge.end]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{formatMoney(v, currency)}</dd></div>
            ))}
          </dl>
        ) : <p className="text-sm text-muted-foreground">Нет данных: счетов в выбранной валюте за период нет.</p>}
        <p className="mt-3 text-xs text-muted-foreground">Компаний всего: {m.tenants_total}, из них demo: {m.tenants_demo}.</p>
      </Card>
    </>
  );
}
