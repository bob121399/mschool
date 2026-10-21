import { z } from "zod";
import { route } from "@/lib/api";
import { tenantMemberContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ subject: z.string().trim().min(3).max(200), body: z.string().trim().min(10).max(6000) }).strict();

// tenant/user from the session; the support agent drafts an answer or escalates via a durable job.
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 16384));
  const { db } = await tenantMemberContext();
  const { data, error } = await db.rpc("create_support_ticket", { p_subject: input.subject, p_body: input.body });
  if (error) databaseError(error);
  return json(data, 201);
}, { mutation: true });
