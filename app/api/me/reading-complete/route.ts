import { z } from "zod";
import { route } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, noContent, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ assignmentId: z.uuid(), lessonId: z.uuid() }).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 2048));
  const { db } = await employeeContext();
  const { error } = await db.rpc("complete_reading", { p_assignment: input.assignmentId, p_lesson: input.lessonId });
  if (error) databaseError(error);
  return noContent();
}, { mutation: true });
