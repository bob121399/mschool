import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaPanel } from "@/components/auth/mfa-panel";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = { title: "Двухфакторная проверка" };
export default function MfaPage() {
  return (
    <AuthCard title="Двухфакторная проверка" description="Глобальный доступ суперадминистратора требует MFA."
      footer={<LogoutButton />}>
      <MfaPanel />
    </AuthCard>
  );
}
