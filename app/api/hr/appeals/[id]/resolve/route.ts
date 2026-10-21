import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("upheld"), reason: z.string().trim().min(10).max(4000) }).strict(),
  z.object({ decision: z.literal("overturned"), reason: z.string().trim().min(10).max(4000),
    overridePassed: z.boolean(), overrideScore: z.number().int().min(0).max(100) }).strict(),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/hr/appeals/[id]/resolve">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 16384));
    const { db } = await hrContext();
    const { data, error } = await db.rpc("resolve_appeal", {
      p_appeal: id, p_decision: input.decision, p_reason: input.reason,
      p_override_passed: input.decision === "overturned" ? input.overridePassed : undefined,
      p_override_score: input.decision === "overturned" ? input.overrideScore : undefined,
    });
    if (error) databaseError(error);
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
