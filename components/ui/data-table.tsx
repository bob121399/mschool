"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "./cn";

export type Column = { key: string; label: string; sortable?: boolean; className?: string };

/** Server-driven table: pagination 25/50/100, whitelisted sort, 300 ms debounced search, URL state
 * (spec 4.2). Rows are rendered on the server from the same URL params. */
export function DataTable({ columns, rows, total, page, pageSize, sort, dir, searchLabel, empty, caption }: {
  columns: Column[]; rows: { key: string; cells: ReactNode[] }[]; total: number; page: number; pageSize: number;
  sort?: string; dir?: "asc" | "desc"; searchLabel?: string; empty: ReactNode; caption: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) if (v === null || v === "") next.delete(k); else next.set(k, v);
    return `${pathname}?${next.toString()}`;
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => router.replace(href({ q, page: "1" })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {searchLabel ? (
          <label className="relative flex min-w-64 flex-1 items-center sm:max-w-sm">
            <span className="sr-only">{searchLabel}</span>
            <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} type="search"
              className="min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" />
          </label>
        ) : <span />}
        <label className="flex items-center gap-2 text-sm">
          Строк на странице
          <select value={pageSize} onChange={(e) => router.replace(href({ size: e.target.value, page: "1" }))}
            className="min-h-11 rounded-lg border border-border bg-surface px-2">
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground lg:hidden" aria-hidden>Таблица прокручивается горизонтально →</p>
      <div className="relative overflow-x-auto rounded-card border border-border bg-surface" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted text-left">
            <tr>
              {columns.map((c) => {
                const active = sort === c.key;
                return (
                  <th key={c.key} scope="col" className={cn("p-3 font-medium", c.className)}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortable ? (
                      <Link href={href({ sort: c.key, dir: active && dir === "asc" ? "desc" : "asc" })} className="inline-flex items-center gap-1 hover:underline">
                        {c.label}{active ? (dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
                      </Link>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-6">{empty}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} className="border-t border-border align-top">
                {r.cells.map((cell, i) => <td key={i} className={cn("p-3", columns[i]?.className)}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Всего: {total}</span>
        <div className="flex items-center gap-2">
          <Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} href={href({ page: String(Math.max(1, page - 1)) })}
            className={cn("inline-flex size-11 items-center justify-center rounded-lg border border-border", page <= 1 && "pointer-events-none opacity-40")}>
            <ChevronLeft className="size-4" aria-hidden /><span className="sr-only">Предыдущая</span>
          </Link>
          <span className="tabular-nums">{page} / {pages}</span>
          <Link aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} href={href({ page: String(Math.min(pages, page + 1)) })}
            className={cn("inline-flex size-11 items-center justify-center rounded-lg border border-border", page >= pages && "pointer-events-none opacity-40")}>
            <ChevronRight className="size-4" aria-hidden /><span className="sr-only">Следующая</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
