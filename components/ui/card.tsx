import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ title, description, actions, children, className }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-card border border-border bg-surface p-5", className)}>
      {title || actions ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Metric card: always shows the period and definition; missing data renders «Нет данных». */
export function MetricCard({ label, value, period, definition }: {
  label: string; value: string | null; period: string; definition: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-tight tabular-nums md:text-[32px]">{value ?? "Нет данных"}</p>
      <p className="mt-2 text-xs text-muted-foreground">{period}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Определение</summary>
        <p className="mt-1">{definition}</p>
      </details>
    </section>
  );
}
