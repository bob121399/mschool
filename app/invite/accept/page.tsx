import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { Alert } from "@/components/ui/alert";
import { userDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Приглашение" };

export default async function InviteAcceptPage({ searchParams }: PageProps<"/invite/accept">) {
  const params = await searchParams;
  const token = typeof params.token === "string" && /^[0-9a-f]{64}$/u.test(params.token) ? params.token : null;
  if (!token) return <AuthCard title="Приглашение"><Alert kind="error">Ссылка приглашения недействительна.</Alert></AuthCard>;
  const { data } = await (await userDb()).auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`);
  return (
    <AuthCard title="Присоединение к обучению" description="Задайте пароль. Компания и грейд определены приглашением HR.">
      <InviteAcceptForm token={token} email={data.user.email ?? ""} />
    </AuthCard>
  );
}
