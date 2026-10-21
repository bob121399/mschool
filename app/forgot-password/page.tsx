import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Восстановление пароля" };
export default function ForgotPasswordPage() {
  return <AuthCard title="Восстановление пароля"><ForgotPasswordForm /></AuthCard>;
}
