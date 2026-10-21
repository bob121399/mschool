import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/logo";

export function AuthCard({ title, description, children, footer }: {
  title: string; description?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" aria-label="MSchool — на главную" className="inline-block rounded-2xl">
          <BrandLogo width={96} />
        </Link>
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
