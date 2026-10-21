import { z } from "zod";
import { randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  grade: z.enum(["junior", "middle", "senior", "head"]).optional(),
  departmentId: z.uuid().nullable().optional(),
  status: z.enum(["active", "suspended"]).optional(),
}).strict();

// Only grade/department/status of an employee of own tenant; grade change cancels the active
// assignment in the same transaction (update_employee).
export async function PATCH(request: Request, ctx: RouteContext<"/api/hr/employees/[id]">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 2048));
    const { db } = await hrContext();
    const { data, error } = await db.rpc("update_employee", {
      p_user: id, p_grade: input.grade, p_department: input.departmentId ?? undefined,
      p_clear_department: input.departmentId === null, p_status: input.status,
    });
    if (error) databaseError(error);
    return json(data);
  } catch (error) {
    return publicError(error, traceId);
  }
}
