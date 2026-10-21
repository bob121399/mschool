import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";
import { draftPayload } from "@/lib/courses/schema";
import type { Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";
const body = z.object({ expectedRevision: z.number().int().min(0), payload: draftPayload }).strict();

// Transactional draft save with optimistic revision guard (409 REVISION_CONFLICT).
export async function PATCH(request: Request, ctx: RouteContext<"/api/hr/courses/[id]">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 1_000_000));
    const { db } = await hrContext();
    const { data, error } = await db.rpc("save_course_draft", { p_course: id, p_expected_revision: input.expectedRevision,
      p_payload: input.payload as unknown as Json });
    if (error) databaseError(error);
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
