import { z } from "zod";

/** Parses table URL state with a sort whitelist (spec 4.2 DataTable). */
export function tableParams<S extends string>(raw: Record<string, string | string[] | undefined>, sortable: readonly S[], defaultSort: S) {
  const one = (k: string) => (typeof raw[k] === "string" ? raw[k] : undefined);
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(one("page") ?? 1);
  const size = [25, 50, 100].includes(Number(one("size"))) ? Number(one("size")) : 25;
  const sort = (sortable as readonly string[]).includes(one("sort") ?? "") ? (one("sort") as S) : defaultSort;
  const dir: "asc" | "desc" = one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : "asc";
  const q = (one("q") ?? "").trim().slice(0, 100);
  return { page, size, sort, dir, q, from: (page - 1) * size, to: page * size - 1 };
}

export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/gu, (m) => `\\${m}`)}%`;
}
