import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sessionContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, publicError } from "@/lib/http";

export const dynamic = "force-dynamic";

// Author, HR of the tenant or MFA superadmin (RLS ticket_read); otherwise 404.
export async function GET(_request: Request, ctx: RouteContext<"/api/support/tickets/[id]">) {
  const traceId = randomUUID();
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await sessionContext();
    const { data, error } = await db.from("support_tickets")
      .select("id,subject,body,status,category,severity,agent_reply,escalation_reason,resolution,created_at,updated_at")
      .eq("id", id).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new HttpError(404, "NOT_FOUND");
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
