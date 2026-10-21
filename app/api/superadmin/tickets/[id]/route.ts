import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ status: z.enum(["open", "escalated", "resolved"]), resolution: z.string().trim().max(4000).default("") }).strict();

export async function PATCH(request: Request, ctx: RouteContext<"/api/superadmin/tickets/[id]">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 8192));
    const { db } = await superadminContext();
    const { error } = await db.rpc("update_ticket_status", { p_ticket: id, p_status: input.status, p_resolution: input.resolution });
    if (error) databaseError(error);
    return json({ status: input.status });
  } catch (error) {
    return publicError(error, traceId);
  }
}
