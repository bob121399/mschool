import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ confirmPreview: z.literal(true) }).strict();

// Human approval after preview of extracted chunks; the trigger requires a managing human and
// makes the source immutable.
export async function POST(request: Request, ctx: RouteContext<"/api/hr/documents/[id]/approve">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    body.parse(await readJson(request, 256));
    const { db } = await hrContext();
    const { error } = await db.rpc("approve_document", { p_document: id });
    if (error) databaseError(error);
    return json({ status: "approved" });
  } catch (error) {
    return publicError(error, traceId);
  }
}
