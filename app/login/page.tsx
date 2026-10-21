import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null, "/login");
  return (
    <AuthCard title="Вход в MSchool" footer={<>
      <Link href="/forgot-password" className="underline">Забыли пароль?</Link>
      <span className="mx-2">·</span>
      <Link href="/signup" className="underline">Регистрация компании</Link>
    </>}>
      <LoginForm next={next} linkError={params.error === "link"} />
    </AuthCard>
  );
}
