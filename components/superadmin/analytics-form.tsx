"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function AnalyticsForm({ templates, defaultStart, defaultEnd }: { templates: { id: string; title: string }[]; defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField label="Шаблон" value={templateId} onChange={(e) => setTemplateId(e.target.value)} options={templates.map((t) => ({ value: t.id, label: t.title }))} />
      <TextField label="С" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      <TextField label="По (не включая)" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      <Button onClick={async () => {
        const r = await apiFetch("/api/superadmin/analytics", { method: "POST", body: { templateId, periodStart: start, periodEnd: end } });
        setMsg(r.ok ? { kind: "success", text: "Отчет поставлен в очередь." } : { kind: "error", text: errorMessage(r.error) });
        router.refresh();
      }}>Построить</Button>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
    </div>
  );
}
