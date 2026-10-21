import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  title: z.string().trim().min(1).max(300),
  grade: z.enum(["junior", "middle", "senior", "head"]),
  description: z.string().max(4000).default(""),
}).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 8192));
  const { db, tenantId } = await hrContext();
  const { data, error } = await db.rpc("create_course_draft", { p_title: input.title, p_grade: input.grade,
    p_description: input.description, p_tenant: tenantId });
  if (error) databaseError(error);
  return json({ courseId: data }, 201);
}, { mutation: true });
