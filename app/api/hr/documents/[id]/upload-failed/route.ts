import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, noContent, publicError, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/hr/documents/[id]/upload-failed">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await hrContext();
    const { error } = await db.from("documents").update({ status: "failed", error_code: "UPLOAD_FAILED" })
      .eq("id", id).eq("status", "uploaded");
    if (error) databaseError(error);
    return noContent();
  } catch (error) {
    return publicError(error, traceId);
  }
}
