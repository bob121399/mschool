"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextArea, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

/** Human decision with mandatory rationale; overriding creates a separate record (original kept). */
export function AppealResolve({ appealId, label }: { appealId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"upheld" | "overturned">("upheld");
  const [reason, setReason] = useState("");
  const [passed, setPassed] = useState(true);
  const [score, setScore] = useState(80);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Рассмотреть</Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Апелляция: ${label}`} description="Исходная оценка модели сохраняется. Решение фиксируется в журнале от вашего имени."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button><Button disabled={reason.trim().length < 10} onClick={async () => {
          const r = await apiFetch(`/api/hr/appeals/${appealId}/resolve`, { method: "POST", body: decision === "upheld"
            ? { decision, reason } : { decision, reason, overridePassed: passed, overrideScore: score } });
          if (!r.ok) { setError(errorMessage(r.error)); return; }
          setOpen(false); router.refresh();
        }}>Сохранить решение</Button></>}>
        <div className="space-y-4">
          {error ? <Alert kind="error">{error}</Alert> : null}
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Решение</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" className="size-5" checked={decision === "upheld"} onChange={() => setDecision("upheld")} />Оставить оценку</label>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" className="size-5" checked={decision === "overturned"} onChange={() => setDecision("overturned")} />Пересмотреть (ручное решение)</label>
          </fieldset>
          {decision === "overturned" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={passed} onChange={(e) => setPassed(e.target.checked)} />Засчитать урок</label>
              <TextField label="Балл" type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
            </div>
          ) : null}
          <TextArea label="Обоснование (обязательно)" required maxChars={4000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </>
  );
}
