import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ expectedRevision: z.number().int().min(0), reviewConfirmed: z.literal(true) }).strict();

// draft → published by the human HR session; SQL validators + admin audit in the trigger.
export async function POST(request: Request, ctx: RouteContext<"/api/hr/courses/[id]/publish">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 256));
    const { db } = await hrContext();
    const { data, error } = await db.rpc("publish_course", { p_course: id, p_expected_revision: input.expectedRevision });
    if (error) databaseError(error);
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
