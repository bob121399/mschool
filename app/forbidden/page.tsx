import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { LogoutButton } from "@/components/auth/logout-button";

export const metadata: Metadata = { title: "Доступ запрещен" };
export default function ForbiddenPage() {
  return (
    <AuthCard title="Доступ запрещен" description="У вашей учетной записи нет доступа к этому разделу, либо учетная запись или компания приостановлена.">
      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 hover:bg-muted">На главную своей роли</Link>
        <LogoutButton />
      </div>
    </AuthCard>
  );
}
