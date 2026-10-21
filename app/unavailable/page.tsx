import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Сервис недоступен" };
export default function UnavailablePage() {
  return (
    <AuthCard title="Сервис временно недоступен" description="Не удалось проверить сессию или связаться с базой данных. Повторите попытку позже.">
      <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 hover:bg-muted">Повторить</Link>
    </AuthCard>
  );
}
