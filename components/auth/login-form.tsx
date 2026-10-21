"use client";
import { useState, type FormEvent } from "react";
import { browserDb } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError ? "Ссылка недействительна или устарела. Войдите или запросите новую." : null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authError } = await browserDb().auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      // Same message for unknown email and wrong password (no account enumeration).
      setError(authError.message.toLowerCase().includes("not confirmed")
        ? "Email не подтвержден. Проверьте почту." : "Неверный email или пароль.");
      setLoading(false);
      return;
    }
    // Full navigation so the proxy evaluates role/MFA with fresh cookies.
    window.location.assign(next);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Email" type="email" autoComplete="email" required value={email}
        onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Пароль" type="password" autoComplete="current-password" required value={password}
        onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" className="w-full" loading={loading} loadingText="Входим…">Войти</Button>
    </form>
  );
}
