import { z } from "zod";
import { route } from "@/lib/api";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";
import { ANALYTICS_TEMPLATES } from "@/lib/analytics";

export const dynamic = "force-dynamic";
const body = z.object({
  templateId: z.enum(Object.keys(ANALYTICS_TEMPLATES) as [string, ...string[]]),
  periodStart: z.iso.date(), periodEnd: z.iso.date(),
}).strict();

// Template ID + bounded typed params only; SQL is fixed server-side (no model-generated SQL).
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 512));
  const { db } = await superadminContext();
  const { data, error } = await db.rpc("request_analytics", { p_template: input.templateId, p_start: input.periodStart, p_end: input.periodEnd });
  if (error) databaseError(error);
  return json({ jobId: data }, 202);
}, { mutation: true });
