import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ReasonAction, SimpleAction } from "@/components/superadmin/actions";
import { formatDate } from "@/lib/i18n/labels";

export const metadata: Metadata = { title: "Лиды" };

export default async function LeadsPage() {
  const ctx = await requireSuperadmin();
  const leads = await ctx.db.from("leads").select("id,email,company_name,status,qualification,consent_at,created_at,tenant_id")
    .order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader title="Лиды и пилоты" description="Квалификация — AI Sales (ROI считает калькулятор кода). Приглашение на пилот — только после проверки и согласия; компанию создает серверный provisioner при регистрации." />
      {(leads.data ?? []).length === 0 ? <EmptyState title="Лидов нет" /> : (
        <ul className="space-y-3">{(leads.data ?? []).map((l) => {
          const q = l.qualification as { qualification?: string; fit_score?: number; summary?: string; missing_fields?: string[] } | null;
          return (
            <li key={l.id} className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{l.company_name}</p><span className="text-muted-foreground">{l.email}</span>
                <Badge>{l.status}</Badge>{l.consent_at ? <Badge tone="success">согласие {formatDate(l.consent_at)}</Badge> : <Badge tone="warning">нет согласия</Badge>}
                <span className="ml-auto flex gap-2">
                  <SimpleAction label="Квалифицировать (AI)" endpoint={`/api/superadmin/leads/${l.id}/qualify`} body={{}} done="Задача поставлена в очередь" />
                  {!l.tenant_id ? <ReasonAction label="Пригласить на пилот" title="Приглашение на пилот" consequence="На email лида будет отправлено письмо Supabase Auth со ссылкой на регистрацию пространства."
                    endpoint={`/api/superadmin/leads/${l.id}/invite`} kind="lead-invite" /> : null}
                </span></div>
              {q?.qualification ? <p>Оценка: {q.qualification}, fit {q.fit_score}. {q.summary} {q.missing_fields?.length ? `Не хватает: ${q.missing_fields.join(", ")}` : ""}</p> : null}
            </li>
          );
        })}</ul>
      )}
    </>
  );
}
