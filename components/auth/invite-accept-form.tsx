"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiFetch, errorMessage } from "@/lib/client/api";

export function InviteAcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Пароль — не менее 10 символов."); return; }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/invitations/accept", { method: "POST", body: { token, password, fullName } });
    if (!res.ok) { setError(errorMessage(res.error)); setLoading(false); return; }
    router.replace("/learn");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Email" value={email} readOnly />
      <TextField label="Имя и фамилия" value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      <TextField label="Пароль" type="password" required value={password} autoComplete="new-password"
        helper="Не менее 10 символов" onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" className="w-full" loading={loading}>Принять приглашение</Button>
    </form>
  );
}
