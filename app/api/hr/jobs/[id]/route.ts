import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, publicError } from "@/lib/http";
import { jobNextAction } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/hr/jobs/[id]">) {
  const traceId = randomUUID();
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await hrContext();
    const { data, error } = await db.from("agent_jobs")
      .select("id,agent_type,status,attempts,max_attempts,last_error_code,result,created_at,updated_at,finished_at")
      .eq("id", id).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new HttpError(404, "NOT_FOUND");
    return json({ ...data, next_action: jobNextAction(data.status, data.last_error_code) });
  } catch (error) {
    return publicError(error, traceId);
  }
}
