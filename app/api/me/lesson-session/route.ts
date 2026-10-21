import { z } from "zod";
import { route } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ assignmentId: z.uuid(), lessonId: z.uuid() }).strict();

// Server-issued one-time engagement token (activity for billing is never a client counter).
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 2048));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("start_lesson_session", { p_assignment: input.assignmentId, p_lesson: input.lessonId });
  if (error) databaseError(error);
  return json(data, 201);
}, { mutation: true });
