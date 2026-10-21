import Link from "next/link";
import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { databaseError } from "@/lib/http";
import { likePattern, tableParams } from "@/lib/table";
import { PageHeader } from "@/components/shell/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, tenantStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Компании" };

export default async function TenantsPage({ searchParams }: PageProps<"/superadmin/tenants">) {
  const ctx = await requireSuperadmin();
  const p = tableParams(await searchParams, ["name", "created_at"] as const, "name");
  let q = ctx.db.from("tenants").select("id,name,subscription_tier,status,is_demo,created_at", { count: "exact" });
  if (p.q) q = q.ilike("name", likePattern(p.q));
  const res = await q.order(p.sort, { ascending: p.dir === "asc" }).range(p.from, p.to);
  if (res.error) databaseError(res.error);
  const ids = (res.data ?? []).map((t) => t.id);
  const lastInvoices = ids.length ? await ctx.db.from("invoices").select("tenant_id,period_start,active_seats,amount_minor,currency")
    .in("tenant_id", ids).order("period_start", { ascending: false }) : { data: [] };
  const lastActivity = ids.length ? await ctx.db.from("activity_events").select("tenant_id,occurred_at").in("tenant_id", ids)
    .order("occurred_at", { ascending: false }).limit(1000) : { data: [] };
  return (
    <>
      <PageHeader title="Компании" description="Просмотр данных конкретной компании требует основания и записывается в журнал." />
      <DataTable caption="Компании" searchLabel="Поиск по названию" total={res.count ?? 0} page={p.page} pageSize={p.size} sort={p.sort} dir={p.dir}
        empty={<EmptyState title="Компаний нет" />}
        columns={[{ key: "name", label: "Название", sortable: true }, { key: "tier", label: "Тариф" }, { key: "status", label: "Статус" },
          { key: "seats", label: "Места (последний счет)" }, { key: "activity", label: "Последняя активность" }, { key: "created_at", label: "Создана", sortable: true }]}
        rows={(res.data ?? []).map((t) => {
          const inv = (lastInvoices.data ?? []).find((i) => i.tenant_id === t.id);
          const act = (lastActivity.data ?? []).find((a) => a.tenant_id === t.id);
          return { key: t.id, cells: [
            <span key="n"><Link className="font-medium hover:underline" href={`/superadmin/tenants/${t.id}`}>{t.name}</Link>{t.is_demo ? <Badge tone="warning">demo</Badge> : null}</span>,
            t.subscription_tier, <Badge key="s" tone={t.status === "active" ? "success" : t.status === "suspended" ? "danger" : "neutral"}>{tenantStatusLabels[t.status]}</Badge>,
            inv ? `${inv.active_seats} (${inv.period_start.slice(0, 7)})` : "Нет данных", act ? formatDate(act.occurred_at) : "—", formatDate(t.created_at)] };
        })} />
    </>
  );
}
