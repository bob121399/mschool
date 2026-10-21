import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ reason: z.string().trim().min(10).max(500), scope: z.enum(["details", "export"]).default("details") }).strict();

// Global investigation: explicit company + reason, recorded before data is shown (spec 2.5).
export async function POST(request: Request, ctx: RouteContext<"/api/superadmin/tenants/[id]/view">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 2048));
    const { db } = await superadminContext();
    const { error } = await db.rpc("log_superadmin_view", { p_tenant: id, p_reason: input.reason, p_scope: input.scope });
    if (error) databaseError(error);
    return json({ ok: true });
  } catch (error) {
    return publicError(error, traceId);
  }
}
