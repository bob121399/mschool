import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ReasonAction } from "@/components/superadmin/actions";
import { formatMoney, invoiceStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Счета" };

export default async function SuperBilling() {
  const ctx = await requireSuperadmin();
  const inv = await ctx.db.from("invoices").select("id,period_start,active_seats,amount_minor,currency,status,payment_reference,tenants(name,is_demo)")
    .order("period_start", { ascending: false }).limit(200);
  return (
    <>
      <PageHeader title="Счета" description="Оплата подтверждается человеком по банковскому документу; ссылка на платеж уникальна. Автоматического списания нет." />
      {(inv.data ?? []).length === 0 ? <EmptyState title="Счетов нет" /> : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm"><caption className="sr-only">Счета всех компаний</caption>
            <thead className="bg-muted text-left"><tr><th scope="col" className="p-3">Компания</th><th scope="col" className="p-3">Месяц</th><th scope="col" className="p-3">Места</th>
              <th scope="col" className="p-3">Сумма</th><th scope="col" className="p-3">Статус</th><th scope="col" className="p-3">Действие</th></tr></thead>
            <tbody>{(inv.data ?? []).map((i) => {
              const t = i.tenants as { name: string; is_demo: boolean } | null;
              return (
                <tr key={i.id} className="border-t border-border"><td className="p-3">{t?.name}{t?.is_demo ? " (demo)" : ""}</td><td className="p-3">{i.period_start.slice(0, 7)}</td>
                  <td className="p-3 tabular-nums">{i.active_seats}</td><td className="p-3 tabular-nums">{formatMoney(i.amount_minor, i.currency)}</td>
                  <td className="p-3"><Badge tone={i.status === "paid" ? "success" : "neutral"}>{invoiceStatusLabels[i.status]}</Badge>{i.payment_reference ? <span className="ml-1 text-xs">{i.payment_reference}</span> : null}</td>
                  <td className="p-3">{i.status === "issued" ? <ReasonAction label="Подтвердить оплату" title="Подтверждение оплаты" consequence="Только по подтвержденному платежному документу. Действие необратимо и журналируется."
                    endpoint={`/api/superadmin/invoices/${i.id}/mark-paid`}
                    fields={[{ name: "ref", label: "Номер платежного документа", initial: "" }, { name: "date", label: "Дата оплаты", type: "date", initial: new Date().toISOString().slice(0, 10) }]}
                    kind="mark-paid" /> : null}</td></tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
