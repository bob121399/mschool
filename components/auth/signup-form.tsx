"use client";
import { useState, type FormEvent } from "react";
import { browserDb } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

// Public signup creates only an Auth identity. Tenant and role are assigned later by the trusted
// server (onboarding provisioner or invitation), never chosen here (spec step 4.2).
export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Пароль — не менее 10 символов."); return; }
    setState("loading");
    setError(null);
    const { error: authError } = await browserDb().auth.signUp({ email: email.trim().toLowerCase(), password });
    if (authError) { setError("Не удалось зарегистрироваться. Проверьте email или попробуйте позже."); setState("error"); return; }
    setState("sent");
  }

  if (state === "sent") {
    return <Alert kind="success" title="Проверьте почту">Мы отправили ссылку для подтверждения email. После подтверждения вы
      сможете создать пробное пространство компании.</Alert>;
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <TextField label="Рабочий email" type="email" autoComplete="email" required value={email}
        onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Пароль" type="password" autoComplete="new-password" required value={password}
        helper="Не менее 10 символов" onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" className="w-full" loading={state === "loading"} loadingText="Отправляем…">Зарегистрироваться</Button>
    </form>
  );
}
