"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function ReportRequest({ defaultWeek }: { defaultWeek: string }) {
  const router = useRouter();
  const [week, setWeek] = useState(defaultWeek);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextField label="Неделя с понедельника" type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
      <Button onClick={async () => {
        const r = await apiFetch("/api/hr/reports", { method: "POST", body: { periodStart: week } });
        setMsg(r.ok ? { kind: "success", text: "Отчет поставлен в очередь. Обновите страницу через минуту." } : { kind: "error", text: errorMessage(r.error) });
        router.refresh();
      }}>Сформировать отчет</Button>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
    </div>
  );
}
