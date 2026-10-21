"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client/api";

export type ReasonKind = "tenant-update" | "invoice-generate" | "role" | "subscription" | "mark-paid" | "lead-invite";

/** Request bodies are built client-side from a serializable kind + context (functions cannot cross
 * the server → client boundary). */
function buildBody(kind: ReasonKind, ctx: Record<string, string>, v: Record<string, string>, reason: string): unknown {
  switch (kind) {
    case "tenant-update": return { tier: v.tier, status: v.status, maxDailyAiCalls: Number(v.max), reason };
    case "invoice-generate": return { tenantId: ctx.tenantId, periodStart: v.month };
    case "role": return { role: ctx.role, reason };
    case "subscription": return { tenantId: ctx.tenantId, tier: v.tier, currency: v.currency, seatPriceMinor: v.tier === "enterprise" ? 0 : Number(v.seat),
      minimumMinor: Number(v.min), periodStart: v.start, periodEnd: v.end, contract: { reference: v.ref ?? "" }, reason };
    case "mark-paid": return { paymentReference: v.ref, paidAt: new Date(`${v.date}T12:00:00Z`).toISOString(), reason };
    case "lead-invite": return { reason };
  }
}

/** Generic "reason required" action dialog for audited superadmin mutations. */
export function ReasonAction({ label, title, consequence, endpoint, method = "POST", kind, context = {}, fields, variant = "secondary" }: {
  label: string; title: string; consequence: string; endpoint: string; method?: "POST" | "PATCH";
  kind: ReasonKind; context?: Record<string, string>; fields?: { name: string; label: string; type?: string; options?: { value: string; label: string }[]; initial?: string }[];
  variant?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries((fields ?? []).map((f) => [f.name, f.initial ?? ""])));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} description={consequence}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} loading={loading} disabled={reason.trim().length < 10} onClick={async () => {
            setLoading(true);
            const r = await apiFetch(endpoint, { method, body: buildBody(kind, context, values, reason) });
            setLoading(false);
            if (!r.ok) { setError(errorMessage(r.error)); return; }
            setOpen(false); toast.show("success", "Сохранено, действие записано в журнал"); router.refresh();
          }}>Подтвердить</Button></>}>
        <div className="space-y-3">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {(fields ?? []).map((f) => f.options
            ? <SelectField key={f.name} label={f.label} value={values[f.name] ?? ""} options={f.options} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            : <TextField key={f.name} label={f.label} type={f.type ?? "text"} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />)}
          <TextField label="Основание (обязательно, ≥10 символов)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </>
  );
}

export function SimpleAction({ label, endpoint, body, done, children }: { label: string; endpoint: string; body: unknown; done: string; children?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="secondary" loading={loading} onClick={async () => {
        setLoading(true);
        const r = await apiFetch(endpoint, { method: "POST", body });
        setLoading(false);
        if (!r.ok) setError(errorMessage(r.error)); else { toast.show("success", done); router.refresh(); }
      }}>{label}</Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {children}
    </span>
  );
}
