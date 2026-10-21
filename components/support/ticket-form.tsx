"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function TicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true);
      const r = await apiFetch("/api/support/tickets", { method: "POST", body: { subject, body } });
      setLoading(false);
      if (!r.ok) { setMsg({ kind: "error", text: errorMessage(r.error) }); return; }
      setSubject(""); setBody("");
      setMsg({ kind: "success", text: "Обращение создано. Ответ появится в списке ниже." });
      router.refresh();
    }}>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
      <Alert kind="info">Не указывайте пароли, коды подтверждения и платежные реквизиты.</Alert>
      <TextField label="Тема" required value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      <TextArea label="Описание" required maxChars={6000} value={body} onChange={(e) => setBody(e.target.value)}
        helper="Опишите шаги и, если есть, код ошибки (trace)." />
      <Button type="submit" loading={loading} disabled={subject.trim().length < 3 || body.trim().length < 10}>Отправить</Button>
    </form>
  );
}

export function TicketStatusControl({ ticketId, endpoint }: { ticketId: string; endpoint: "hr" | "superadmin" }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = async (status: "escalated" | "resolved") => {
    const r = await apiFetch(`/api/${endpoint === "hr" ? "hr" : "superadmin"}/tickets/${ticketId}`, { method: "PATCH", body: { status, resolution } });
    if (!r.ok) setError(errorMessage(r.error)); else router.refresh();
  };
  return (
    <div className="space-y-2">
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Решение (для закрытия)" value={resolution} maxLength={4000} onChange={(e) => setResolution(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void set("escalated")}>Эскалировать</Button>
        <Button size="sm" disabled={resolution.trim().length < 3} onClick={() => void set("resolved")}>Закрыть</Button>
      </div>
    </div>
  );
}
