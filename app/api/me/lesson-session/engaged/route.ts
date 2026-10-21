import { z } from "zod";
import { route } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/u) }).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 1024));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("record_lesson_engagement", { p_token: input.token });
  if (error) databaseError(error);
  return json(data);
}, { mutation: true });
