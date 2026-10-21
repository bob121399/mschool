import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const page = z.coerce.number().int().min(1).max(1000).default(1).parse(searchParams(request).get("page") ?? undefined);
  const { db, tenantId } = await hrContext();
  const size = 25;
  const { data, error, count } = await db.from("hr_reports")
    .select("id,period_start,period_end,metrics,narrative,report_version,created_at", { count: "exact" })
    .eq("tenant_id", tenantId).order("period_start", { ascending: false }).range((page - 1) * size, page * size - 1);
  if (error) databaseError(error);
  return json({ items: data, total: count ?? 0, page, pageSize: size });
}, { mutation: false });

const body = z.object({ periodStart: z.iso.date() }).strict();
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 256));
  const { db } = await hrContext();
  const { data, error } = await db.rpc("request_hr_report", { p_period_start: input.periodStart });
  if (error) databaseError(error);
  return json({ jobId: data }, 202);
}, { mutation: true });
