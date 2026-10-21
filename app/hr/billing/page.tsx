import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney, invoiceStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Оплата" };

export default async function HrBillingPage() {
  const ctx = await requireHr();
  const [subs, invoices] = await Promise.all([
    ctx.db.from("subscriptions").select("id,status,tier,currency,seat_price_minor,minimum_monthly_minor,period_start,period_end")
      .eq("tenant_id", ctx.tenantId).order("period_start", { ascending: false }).limit(5),
    ctx.db.from("invoices").select("id,period_start,period_end,active_seats,amount_minor,currency,status,paid_at")
      .eq("tenant_id", ctx.tenantId).order("period_start", { ascending: false }).limit(24),
  ]);
  const sub = subs.data?.[0];
  return (
    <>
      <PageHeader title="Подписка и счета" description="Счет выставляется за закрытый месяц по активным местам; оплату подтверждает сотрудник платформы. Поддержка не меняет платежные данные." />
      <Card title="Подписка">
        {sub ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Тариф</dt><dd className="font-medium capitalize">{sub.tier}</dd></div>
            <div><dt className="text-muted-foreground">Цена места</dt><dd>{sub.tier === "enterprise" ? "по договору" : formatMoney(sub.seat_price_minor, sub.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Минимум в месяц</dt><dd>{formatMoney(sub.minimum_monthly_minor, sub.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Период договора</dt><dd>{formatDate(sub.period_start)} — {formatDate(sub.period_end)}</dd></div>
          </dl>
        ) : <p className="text-sm text-muted-foreground">Подписка не оформлена: компания работает в пробном режиме.</p>}
      </Card>
      <div className="mt-6">
        {(invoices.data ?? []).length === 0 ? <EmptyState title="Счетов нет" /> : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm"><caption className="sr-only">Счета</caption>
              <thead className="bg-muted text-left"><tr><th scope="col" className="p-3">Период</th><th scope="col" className="p-3">Активные места</th>
                <th scope="col" className="p-3">Сумма</th><th scope="col" className="p-3">Статус</th></tr></thead>
              <tbody>{(invoices.data ?? []).map((i) => (
                <tr key={i.id} className="border-t border-border"><td className="p-3">{formatDate(i.period_start)} — {formatDate(i.period_end)}</td>
                  <td className="p-3 tabular-nums">{i.active_seats}</td><td className="p-3 tabular-nums">{formatMoney(i.amount_minor, i.currency)}</td>
                  <td className="p-3"><Badge tone={i.status === "paid" ? "success" : "neutral"}>{invoiceStatusLabels[i.status]}</Badge>{i.paid_at ? ` ${formatDate(i.paid_at)}` : ""}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
