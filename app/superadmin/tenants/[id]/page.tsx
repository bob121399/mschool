import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ReasonAction } from "@/components/superadmin/actions";
import { formatDate, formatMoney, invoiceStatusLabels, roleLabels, tenantStatusLabels } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Компания" };

export default async function TenantPage({ params, searchParams }: PageProps<"/superadmin/tenants/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const reason = typeof sp.reason === "string" ? sp.reason.trim() : "";
  const ctx = await requireSuperadmin();
  const tenant = await ctx.db.from("tenants").select("id,name,status,subscription_tier,max_daily_ai_calls,is_demo,timezone,created_at").eq("id", id).maybeSingle();
  if (!tenant.data) notFound();
  if (reason.length < 10) {
    return (
      <>
        <PageHeader title={`Компания: ${tenant.data.name}`} description="Глобальное исследование выполняется с явным основанием и записывается в журнал просмотра." />
        <form method="get" className="max-w-xl space-y-3 rounded-card border border-border bg-surface p-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Основание просмотра (≥10 символов)
            <input name="reason" required minLength={10} maxLength={500} className="min-h-11 rounded-lg border border-border bg-surface px-3" /></label>
          <button className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover">Открыть данные компании</button>
        </form>
      </>
    );
  }
  const logged = await ctx.db.rpc("log_superadmin_view", { p_tenant: id, p_reason: reason, p_scope: "details" });
  if (logged.error) return <Alert kind="error">Не удалось записать просмотр в журнал. Данные не показаны.</Alert>;
  const [users, subs, invoices, audit] = await Promise.all([
    ctx.db.from("users").select("id,email,full_name,role,grade,status").eq("tenant_id", id).order("role").limit(200),
    ctx.db.from("subscriptions").select("id,status,tier,currency,seat_price_minor,minimum_monthly_minor,period_start,period_end").eq("tenant_id", id).order("period_start", { ascending: false }),
    ctx.db.from("invoices").select("id,period_start,active_seats,amount_minor,currency,status").eq("tenant_id", id).order("period_start", { ascending: false }).limit(24),
    ctx.db.from("admin_audit_logs").select("action,object_type,created_at,actor_id").eq("tenant_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const t = tenant.data;
  const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  return (
    <>
      <div role="note" className="sticky top-16 z-10 -mx-4 mb-4 border-y border-warning/50 bg-warning/15 px-4 py-2 text-sm font-medium md:-mx-6 lg:-mx-8">
        Вы просматриваете данные компании «{t.name}» как суперадминистратор. Основание: {reason}
      </div>
      <PageHeader title={t.name} description={`Создана ${formatDate(t.created_at)} · ${t.timezone}`}
        actions={<>
          <ReasonAction label="Изменить тариф/статус/лимит" title="Изменение компании" consequence="Приостановка блокирует вход сотрудников и HR, новые ИИ-задачи и назначения; история сохраняется."
            endpoint={`/api/superadmin/tenants/${id}`} method="PATCH"
            fields={[{ name: "tier", label: "Тариф", initial: t.subscription_tier, options: ["start", "growth", "enterprise"].map((v) => ({ value: v, label: v })) },
              { name: "status", label: "Статус", initial: t.status, options: Object.entries(tenantStatusLabels).map(([value, label]) => ({ value, label })) },
              { name: "max", label: "Лимит ИИ-вызовов в сутки", type: "number", initial: String(t.max_daily_ai_calls) }]}
            kind="tenant-update" />
          <ReasonAction label="Счет за прошлый месяц" title="Сформировать счет" consequence="Счет за закрытый месяц; повтор вернет существующий счет."
            endpoint="/api/superadmin/invoices" fields={[{ name: "month", label: "Первый день месяца", type: "date", initial: lastMonth.toISOString().slice(0, 10) }]}
            kind="invoice-generate" context={{ tenantId: id }} />
        </>} />
      <p className="mb-4 text-sm"><Link className="underline" href="/superadmin/tenants">← Компании</Link></p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Пользователи" description="Повышение до HR — только суперадминистратор, с MFA, свежим входом и основанием.">
          <ul className="divide-y divide-border text-sm">
            {(users.data ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">{u.full_name || u.email}<br /><span className="text-xs text-muted-foreground">{u.email}</span></span>
                <Badge>{roleLabels[u.role]}</Badge>{u.status !== "active" ? <Badge tone="warning">приостановлен</Badge> : null}
                {u.role === "employee" ? <ReasonAction label="Сделать HR" title="Повышение до HR" consequence="Пользователь получит управление учебным контентом и сотрудниками компании."
                  endpoint={`/api/superadmin/users/${u.id}/role`} kind="role" context={{ role: "hr_admin" }} />
                  : u.role === "hr_admin" ? <ReasonAction label="Снять роль HR" title="Снятие роли HR" consequence="Нельзя снять роль с последнего HR без замены." variant="danger"
                  endpoint={`/api/superadmin/users/${u.id}/role`} kind="role" context={{ role: "employee" }} /> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Подписка" actions={<ReasonAction label="Новая подписка" title="Новая подписка" consequence="Цена и валюта фиксируются в snapshot договора; изменение прайса не переписывает старые счета."
          endpoint="/api/superadmin/subscriptions"
          fields={[{ name: "tier", label: "Тариф", initial: "start", options: ["start", "growth", "enterprise"].map((v) => ({ value: v, label: v })) },
            { name: "currency", label: "Валюта", initial: "USD", options: [{ value: "USD", label: "USD" }, { value: "UZS", label: "UZS" }] },
            { name: "seat", label: "Цена места (в минимальных единицах)", type: "number", initial: "600" },
            { name: "min", label: "Минимум в месяц (в минимальных единицах)", type: "number", initial: "30000" },
            { name: "start", label: "Начало", type: "date", initial: "" }, { name: "end", label: "Окончание", type: "date", initial: "" },
            { name: "ref", label: "Номер договора", initial: "" }]}
          kind="subscription" context={{ tenantId: id }} />}>
          <ul className="space-y-2 text-sm">
            {(subs.data ?? []).map((s) => <li key={s.id}>{s.tier} · {s.currency} · место {formatMoney(s.seat_price_minor, s.currency)} · минимум {formatMoney(s.minimum_monthly_minor, s.currency)} · {formatDate(s.period_start)}—{formatDate(s.period_end)} · {s.status}</li>)}
            {(subs.data ?? []).length === 0 ? <li className="text-muted-foreground">Подписки нет (trial).</li> : null}
          </ul>
          <p className="mt-4 text-sm font-medium">Счета</p>
          <ul className="space-y-1 text-sm">{(invoices.data ?? []).map((i) => (
            <li key={i.id}>{i.period_start.slice(0, 7)} · мест {i.active_seats} · {formatMoney(i.amount_minor, i.currency)} · {invoiceStatusLabels[i.status]}</li>))}</ul>
        </Card>
        <Card title="Административный журнал" className="xl:col-span-2">
          <ul className="space-y-1 text-sm">{(audit.data ?? []).map((a, i) => <li key={i}>{new Date(a.created_at).toLocaleString("ru-RU")} · {a.action} · {a.object_type}</li>)}</ul>
        </Card>
      </div>
    </>
  );
}
