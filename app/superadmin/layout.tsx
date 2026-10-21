import { Activity, BarChart3, Building2, CreditCard, LayoutDashboard, LifeBuoy, Megaphone } from "lucide-react";
import { AppShell, DemoBanner } from "@/components/shell/app-shell";
import { requireSuperadmin } from "@/lib/auth/guard";
import { t } from "@/lib/i18n/dictionaries";

const i = "size-5";
export default async function SuperadminLayout({ children }: LayoutProps<"/superadmin">) {
  const ctx = await requireSuperadmin();
  const { count: real } = await ctx.db.from("tenants").select("id", { count: "exact", head: true }).eq("is_demo", false);
  const demo = (real ?? 0) === 0 || process.env.MSCHOOL_DEMO_MODE === "true";
  return (
    <AppShell title="Платформа MSchool · суперадминистратор" userLabel={ctx.email} banner={demo ? <DemoBanner /> : null} nav={[
      { href: "/superadmin", label: t("nav.dashboard"), icon: <LayoutDashboard className={i} />, exact: true },
      { href: "/superadmin/tenants", label: t("nav.tenants"), icon: <Building2 className={i} /> },
      { href: "/superadmin/billing", label: t("nav.billing"), icon: <CreditCard className={i} /> },
      { href: "/superadmin/support", label: t("nav.support"), icon: <LifeBuoy className={i} /> },
      { href: "/superadmin/agents", label: t("nav.agents"), icon: <Activity className={i} /> },
      { href: "/superadmin/analytics", label: t("nav.analytics"), icon: <BarChart3 className={i} /> },
      { href: "/superadmin/leads", label: t("nav.leads"), icon: <Megaphone className={i} /> },
    ]}>{children}</AppShell>
  );
}
