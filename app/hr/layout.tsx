import { BarChart3, BookOpen, CreditCard, FileText, Gavel, LayoutDashboard, LifeBuoy, Route, Users } from "lucide-react";
import { AppShell, DemoBanner } from "@/components/shell/app-shell";
import { requireHr } from "@/lib/auth/guard";
import { t } from "@/lib/i18n/dictionaries";

const i = "size-5";
export default async function HrLayout({ children }: LayoutProps<"/hr">) {
  const ctx = await requireHr();
  const { data: tenant } = await ctx.db.from("tenants").select("name,is_demo").eq("id", ctx.tenantId).single();
  const demo = tenant?.is_demo || process.env.MSCHOOL_DEMO_MODE === "true";
  return (
    <AppShell title={tenant?.name ?? "MSchool"} userLabel={ctx.email} banner={demo ? <DemoBanner /> : null} nav={[
      { href: "/hr", label: t("nav.dashboard"), icon: <LayoutDashboard className={i} />, exact: true },
      { href: "/hr/employees", label: t("nav.employees"), icon: <Users className={i} /> },
      { href: "/hr/knowledge", label: t("nav.knowledge"), icon: <FileText className={i} /> },
      { href: "/hr/courses", label: t("nav.courses"), icon: <BookOpen className={i} /> },
      { href: "/hr/tracks", label: t("nav.tracks"), icon: <Route className={i} /> },
      { href: "/hr/reports", label: t("nav.reports"), icon: <BarChart3 className={i} /> },
      { href: "/hr/appeals", label: t("nav.appeals"), icon: <Gavel className={i} /> },
      { href: "/hr/billing", label: t("nav.billing"), icon: <CreditCard className={i} /> },
      { href: "/support", label: t("nav.support"), icon: <LifeBuoy className={i} /> },
    ]}>{children}</AppShell>
  );
}
