"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { browserDb } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SkeletonRows } from "@/components/ui/skeleton";

type Enrollment = { factorId: string; qr: string; secret: string };

/** Superadmin TOTP: enroll on first login, verify on every session (AAL2). */
export function MfaPanel() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = browserDb();
      const factors = await db.auth.mfa.listFactors();
      const verified = factors.data?.totp.find((f) => f.status === "verified");
      if (cancelled) return;
      if (verified) { setFactorId(verified.id); setLoading(false); return; }
      for (const f of factors.data?.all ?? []) if (f.status !== "verified") await db.auth.mfa.unenroll({ factorId: f.id });
      const enrolled = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "MSchool superadmin" });
      if (cancelled) return;
      if (enrolled.error || !enrolled.data) { setError("Не удалось начать подключение MFA."); setLoading(false); return; }
      setEnrollment({ factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
      setFactorId(enrolled.data.id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError(null);
    const res = await browserDb().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (res.error) { setError("Неверный код. Проверьте время на устройстве и повторите."); setLoading(false); return; }
    router.replace("/superadmin");
    router.refresh();
  }

  if (loading && !factorId) return <SkeletonRows rows={3} label="Подготовка MFA" />;
  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {enrollment ? (
        <div className="space-y-3 text-sm">
          <p>Отсканируйте QR-код в приложении-аутентификаторе или введите ключ вручную.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="QR-код для подключения аутентификатора" className="size-48 rounded-lg bg-white p-2" />
          <p className="break-all rounded-lg bg-muted p-2 font-mono text-xs" aria-label="Ключ для ручного ввода">{enrollment.secret}</p>
        </div>
      ) : <p className="text-sm">Введите 6-значный код из приложения-аутентификатора.</p>}
      <TextField label="Код подтверждения" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        required value={code} onChange={(e) => setCode(e.target.value)} />
      <Button type="submit" className="w-full" loading={loading}>Подтвердить</Button>
    </form>
  );
}
