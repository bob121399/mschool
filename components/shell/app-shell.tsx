"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GraduationCap, Menu, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { LogoutButton } from "@/components/auth/logout-button";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

export function AppShell({ nav, title, userLabel, banner, children }: {
  nav: NavItem[]; title: string; userLabel: string; banner?: ReactNode; children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const isActive = (item: NavItem) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  const links = (
    <nav aria-label="Основная навигация" className="flex flex-col gap-1 p-3">
      {nav.map((item) => (
        <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={isActive(item) ? "page" : undefined}
          className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm",
            isActive(item) ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <span aria-hidden className="shrink-0">{item.icon}</span>
          <span className="truncate md:max-lg:sr-only">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">
        Перейти к содержимому
      </a>
      {/* Desktop sidebar 248px; tablet collapses to an icon rail; mobile uses a drawer. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-surface md:flex lg:w-[248px]">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4 font-semibold">
          <GraduationCap className="size-6 shrink-0" aria-hidden /><span className="md:max-lg:sr-only">MSchool</span>
        </div>
        <div className="flex-1 overflow-y-auto">{links}</div>
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Меню">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto bg-surface shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="font-semibold">MSchool</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть меню"
                className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"><X className="size-5" aria-hidden /></button>
            </div>
            {links}
          </div>
        </div>
      ) : null}
      <div className="md:pl-[72px] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted md:hidden"
            aria-label="Открыть меню" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate font-medium">{title}</p>
          <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">{userLabel}</span>
          <ThemeSwitcher />
          <LogoutButton compact />
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div role="note" className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm font-medium">
      Демонстрационные данные: синтетические компании, регламенты и показатели. Целевые KPI не являются достигнутыми.
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
