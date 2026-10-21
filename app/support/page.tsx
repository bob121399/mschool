import type { Metadata } from "next";
import { requireTenantMember } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/card";
import { TicketForm } from "@/components/support/ticket-form";
import { TicketList, type Ticket } from "@/components/support/ticket-list";

export const metadata: Metadata = { title: "Поддержка" };

export default async function SupportPage() {
  const ctx = await requireTenantMember();
  const tickets = await ctx.db.from("support_tickets")
    .select("id,subject,body,status,category,severity,agent_reply,escalation_reason,resolution,created_at")
    .eq("tenant_id", ctx.tenantId).order("created_at", { ascending: false }).limit(50);
  const isHr = ctx.profile.role === "hr_admin";
  return (
    <>
      <PageHeader title="Поддержка" description={isHr ? "Обращения сотрудников вашей компании." : "Ваши обращения."} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <TicketList tickets={(tickets.data ?? []) as Ticket[]} manage={isHr ? "hr" : undefined} />
        <Card title="Новое обращение"><TicketForm /></Card>
      </div>
    </>
  );
}
