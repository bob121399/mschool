import { BookOpen, GraduationCap, LayoutDashboard, LifeBuoy, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireTenantMember } from "@/lib/auth/guard";

const i = "size-5";
export default async function SupportLayout({ children }: LayoutProps<"/support">) {
  const ctx = await requireTenantMember();
  const nav = ctx.profile.role === "hr_admin"
    ? [{ href: "/hr", label: "Обзор", icon: <LayoutDashboard className={i} /> }, { href: "/hr/employees", label: "Сотрудники", icon: <Users className={i} /> },
      { href: "/hr/courses", label: "Курсы", icon: <BookOpen className={i} /> }, { href: "/support", label: "Поддержка", icon: <LifeBuoy className={i} /> }]
    : [{ href: "/learn", label: "Мое обучение", icon: <GraduationCap className={i} /> }, { href: "/support", label: "Поддержка", icon: <LifeBuoy className={i} /> }];
  return <AppShell title="Поддержка" userLabel={ctx.email} nav={nav}>{children}</AppShell>;
}
