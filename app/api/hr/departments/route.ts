import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 1024));
  const { db } = await hrContext();
  const { data, error } = await db.rpc("create_department", { p_name: input.name });
  if (error) databaseError(error);
  return json({ id: data }, 201);
}, { mutation: true });
