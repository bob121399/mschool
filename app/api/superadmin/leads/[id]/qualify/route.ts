import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, publicError, requireOrigin } from "@/lib/http";
import { aiConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/superadmin/leads/[id]/qualify">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await superadminContext();
    if (!aiConfigured()) throw new HttpError(503, "AI_NOT_CONFIGURED");
    const { data, error } = await db.rpc("request_lead_qualification", { p_lead: id });
    if (error) databaseError(error);
    return json({ jobId: data }, 202);
  } catch (error) {
    return publicError(error, traceId);
  }
}
