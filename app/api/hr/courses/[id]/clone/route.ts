import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/hr/courses/[id]/clone">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await hrContext();
    const { data, error } = await db.rpc("clone_course", { p_course: id });
    if (error) databaseError(error);
    return json({ courseId: data }, 201);
  } catch (error) {
    return publicError(error, traceId);
  }
}
