import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  tier: z.enum(["start", "growth", "enterprise"]).optional(),
  status: z.enum(["trial", "active", "suspended", "archived"]).optional(),
  maxDailyAiCalls: z.number().int().min(1).max(10_000_000).optional(),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function PATCH(request: Request, ctx: RouteContext<"/api/superadmin/tenants/[id]">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 2048));
    const { db } = await superadminContext();
    const { error } = await db.rpc("admin_update_tenant", { p_tenant: id, p_tier: input.tier, p_status: input.status,
      p_max_daily_ai_calls: input.maxDailyAiCalls, p_reason: input.reason });
    if (error) databaseError(error);
    return json({ ok: true });
  } catch (error) {
    return publicError(error, traceId);
  }
}
