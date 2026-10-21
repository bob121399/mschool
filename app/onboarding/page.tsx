import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { Alert } from "@/components/ui/alert";
import { userDb } from "@/lib/supabase/server";
import { issueOnboardingNonce } from "@/lib/auth/nonce";

export const metadata: Metadata = { title: "Начало работы" };

export default async function OnboardingPage() {
  const db = await userDb();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login?next=/onboarding");
  if (!data.user.email_confirmed_at) {
    return <AuthCard title="Подтвердите email"><Alert kind="warning">Перейдите по ссылке из письма, затем вернитесь сюда.</Alert></AuthCard>;
  }
  return (
    <AuthCard title="Пробное пространство компании"
      description="Вы станете HR-администратором новой компании. Сотрудники присоединяются только по приглашению."
      footer={<div className="flex items-center justify-center gap-3">
        <span>Вас пригласили как сотрудника? Откройте ссылку из письма-приглашения.</span>
        <LogoutButton compact />
      </div>}>
      <OnboardingForm nonce={issueOnboardingNonce(data.user.id)} />
      <p className="mt-4 text-xs text-muted-foreground">
        Повторная отправка не создаст вторую компанию. <Link className="underline" href="/">О продукте</Link>
      </p>
    </AuthCard>
  );
}
