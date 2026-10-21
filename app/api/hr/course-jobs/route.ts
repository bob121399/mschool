import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, readJson } from "@/lib/http";
import { aiConfigured } from "@/lib/config";
import { COURSE_CREATOR_PROMPT } from "@/prompts";

export const dynamic = "force-dynamic";
const body = z.object({
  documentIds: z.array(z.uuid()).min(1).max(10),
  grade: z.enum(["junior", "middle", "senior", "head"]),
  title: z.string().trim().min(1).max(300),
  maxModules: z.number().int().min(1).max(12),
  maxLessons: z.number().int().min(1).max(60),
}).strict();

// Durable course-generation job (202 + jobId). Sizes are agreed before the paid call.
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 4096));
  const { db } = await hrContext();
  if (!aiConfigured()) throw new HttpError(503, "AI_NOT_CONFIGURED");
  const { data, error } = await db.rpc("request_course_generation", {
    p_document_ids: input.documentIds, p_grade: input.grade, p_title: input.title,
    p_limits: { max_modules: input.maxModules, max_lessons: input.maxLessons }, p_prompt_version: COURSE_CREATOR_PROMPT.version,
  });
  if (error) databaseError(error);
  return json({ jobId: data }, 202);
}, { mutation: true });
