"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function OnboardingForm({ nonce }: { nonce: string }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!consent) { setError("Нужно согласие на обработку данных для пилота."); return; }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/onboarding/trial", { method: "POST", body: { companyName, consent: true, nonce } });
    if (!res.ok) { setError(errorMessage(res.error)); setLoading(false); return; }
    router.replace("/hr");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Название компании" required value={companyName} maxLength={200}
        onChange={(e) => setCompanyName(e.target.value)} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Я подтверждаю полномочия представлять компанию и согласие на обработку учебных данных в рамках пробного
          периода. Платежи и договор оформляются отдельно.</span>
      </label>
      <Button type="submit" className="w-full" loading={loading} loadingText="Создаем пространство…">Создать пробное пространство</Button>
    </form>
  );
}
