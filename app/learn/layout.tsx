import { GraduationCap, History, LifeBuoy } from "lucide-react";
import { AppShell, DemoBanner } from "@/components/shell/app-shell";
import { requireEmployee } from "@/lib/auth/guard";
import { t } from "@/lib/i18n/dictionaries";

const i = "size-5";
export default async function LearnLayout({ children }: LayoutProps<"/learn">) {
  const ctx = await requireEmployee();
  const { data: tenant } = await ctx.db.from("tenants").select("name,is_demo").eq("id", ctx.tenantId).single();
  const demo = tenant?.is_demo || process.env.MSCHOOL_DEMO_MODE === "true";
  return (
    <AppShell title={tenant?.name ?? "MSchool"} userLabel={ctx.email} banner={demo ? <DemoBanner /> : null} nav={[
      { href: "/learn", label: t("nav.learn"), icon: <GraduationCap className={i} />, exact: true },
      { href: "/learn/history", label: t("nav.history"), icon: <History className={i} /> },
      { href: "/support", label: t("nav.support"), icon: <LifeBuoy className={i} /> },
    ]}>{children}</AppShell>
  );
}
