import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const query = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  size: z.coerce.number().int().refine((v) => [25, 50, 100].includes(v)).default(25),
  q: z.string().trim().max(100).default(""),
  status: z.enum(["trial", "active", "suspended", "archived"]).optional(),
  sort: z.enum(["name", "created_at"]).default("created_at"),
});

export const GET = route(async (request) => {
  const p = query.parse(Object.fromEntries(searchParams(request)));
  const { db } = await superadminContext();
  let q = db.from("tenants").select("id,name,subscription_tier,status,is_demo,created_at,max_daily_ai_calls", { count: "exact" });
  if (p.q) q = q.ilike("name", `%${p.q.replace(/[%_\\]/gu, "\\$&")}%`);
  if (p.status) q = q.eq("status", p.status);
  const { data, error, count } = await q.order(p.sort, { ascending: p.sort === "name" }).range((p.page - 1) * p.size, p.page * p.size - 1);
  if (error) databaseError(error);
  return json({ items: data, total: count ?? 0, page: p.page, pageSize: p.size });
}, { mutation: false });
