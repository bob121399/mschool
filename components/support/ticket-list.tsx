import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/i18n/labels";
import { TicketStatusControl } from "./ticket-form";

export type Ticket = { id: string; subject: string; body: string; status: string; category: string | null; severity: string | null;
  agent_reply: unknown; escalation_reason: string | null; resolution: string | null; created_at: string; tenant?: string };

export function TicketList({ tickets, manage }: { tickets: Ticket[]; manage?: "hr" | "superadmin" }) {
  if (!tickets.length) return <EmptyState title="Обращений нет" />;
  return (
    <ul className="space-y-3">
      {tickets.map((t) => {
        const reply = t.agent_reply as { answer?: string; source?: string; article_ids?: string[] } | null;
        return (
          <li key={t.id} className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{t.subject}</p>
              <Badge tone={t.status === "resolved" ? "success" : t.status === "escalated" ? "warning" : "neutral"}>
                {t.status === "open" ? "Открыто" : t.status === "escalated" ? "Передано оператору" : "Решено"}</Badge>
              {t.severity ? <Badge tone={t.severity === "high" ? "danger" : "neutral"}>{t.severity}</Badge> : null}
              {t.tenant ? <span className="text-muted-foreground">{t.tenant}</span> : null}
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(t.created_at)}</span>
            </div>
            <p className="whitespace-pre-line text-muted-foreground">{t.body}</p>
            {reply?.answer ? (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs font-medium">{reply.source === "agent" ? "Ответ AI-поддержки (черновик, не меняет данные)" : "Системное сообщение"}</p>
                <p className="mt-1 whitespace-pre-line">{reply.answer}</p>
              </div>
            ) : t.status === "open" ? <p className="text-xs text-muted-foreground">Ожидает ответа…</p> : null}
            {t.resolution ? <p><strong>Решение:</strong> {t.resolution}</p> : null}
            {manage && t.status !== "resolved" ? <TicketStatusControl ticketId={t.id} endpoint={manage} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
