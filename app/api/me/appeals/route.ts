import { z } from "zod";
import { route } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ attemptId: z.uuid(), reason: z.string().trim().min(10).max(4000) }).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 16384));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("create_appeal", { p_attempt: input.attemptId, p_reason: input.reason });
  if (error) databaseError(error);
  const created = (data as { created?: boolean } | null)?.created === true;
  return json(data, created ? 201 : 200);
}, { mutation: true });
