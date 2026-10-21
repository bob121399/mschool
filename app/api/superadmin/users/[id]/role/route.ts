import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ role: z.enum(["hr_admin", "employee"]), reason: z.string().trim().min(10).max(500) }).strict();

// Promotion to HR: superadmin only, fresh Auth check + MFA (AAL2), audit, last-HR guard (SQL).
export async function POST(request: Request, ctx: RouteContext<"/api/superadmin/users/[id]/role">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 1024));
    const session = await superadminContext();
    // Fresh authentication: the session must have been issued within the last 15 minutes.
    const { data: claims } = await session.db.auth.getClaims();
    const issued = Number((claims?.claims as { iat?: number } | undefined)?.iat ?? 0);
    if (!issued || Date.now() / 1000 - issued > 15 * 60) throw new HttpError(403, "REAUTH_REQUIRED");
    const { error } = await session.db.rpc("set_user_role", { p_user: id, p_role: input.role, p_reason: input.reason });
    if (error) databaseError(error);
    return json({ role: input.role });
  } catch (error) {
    return publicError(error, traceId);
  }
}
