import { z } from "zod";
import { randomUUID } from "node:crypto";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, HttpError, json, publicError } from "@/lib/http";

export const dynamic = "force-dynamic";

// Own attempt only: status + public result. No lease, rubric/reference or raw provider data.
export async function GET(_request: Request, ctx: RouteContext<"/api/me/attempts/[requestId]">) {
  const traceId = randomUUID();
  try {
    const { requestId } = await ctx.params;
    const key = z.uuid().parse(requestId);
    const { db } = await employeeContext();
    const { data, error } = await db.rpc("attempt_status", { p_request_key: key });
    if (error) databaseError(error);
    if (!data) throw new HttpError(404, "NOT_FOUND");
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
