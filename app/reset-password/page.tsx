import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { userDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Новый пароль" };
export default async function ResetPasswordPage() {
  const { data } = await (await userDb()).auth.getUser();
  if (!data.user) redirect("/forgot-password");
  return <AuthCard title="Новый пароль"><ResetPasswordForm /></AuthCard>;
}
