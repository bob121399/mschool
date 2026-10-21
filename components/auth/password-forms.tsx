"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { browserDb } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    // Response is the same whether or not the account exists.
    await browserDb().auth.resetPasswordForEmail(email.trim().toLowerCase());
    setState("sent");
  }
  if (state === "sent") return <Alert kind="info" title="Если аккаунт существует, письмо отправлено">Проверьте почту и перейдите по ссылке.</Alert>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full" loading={state === "loading"}>Отправить ссылку</Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Пароль — не менее 10 символов."); return; }
    if (password !== confirm) { setError("Пароли не совпадают."); return; }
    setLoading(true);
    const { error: authError } = await browserDb().auth.updateUser({ password });
    if (authError) { setError("Не удалось сменить пароль. Запросите новую ссылку."); setLoading(false); return; }
    router.replace("/login");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Новый пароль" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextField label="Повторите пароль" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="submit" className="w-full" loading={loading}>Сохранить пароль</Button>
    </form>
  );
}
