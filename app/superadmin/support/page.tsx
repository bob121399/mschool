import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { TicketList, type Ticket } from "@/components/support/ticket-list";

export const metadata: Metadata = { title: "Поддержка" };

export default async function SuperSupport() {
  const ctx = await requireSuperadmin();
  const tickets = await ctx.db.from("support_tickets")
    .select("id,subject,body,status,category,severity,agent_reply,escalation_reason,resolution,created_at,tenants(name)")
    .order("status").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Поддержка (L2)" description="Эскалации требуют человека-владельца. Агент поддержки не меняет счета, роли и оценки." />
      <TicketList manage="superadmin" tickets={(tickets.data ?? []).map((t) => ({ ...t, tenant: (t.tenants as { name: string } | null)?.name })) as Ticket[]} />
    </>
  );
}
