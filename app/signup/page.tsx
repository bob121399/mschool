import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Регистрация" };

export default function SignupPage() {
  return (
    <AuthCard title="Пилот MSchool для компании"
      description="Регистрация для HR/L&D-руководителя. Сотрудники подключаются по приглашению HR."
      footer={<Link href="/login" className="underline">Уже есть аккаунт? Войти</Link>}>
      <SignupForm />
    </AuthCard>
  );
}
