import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError, databaseError, json, readJson } from "@/lib/http";
import { userDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const body = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/u),
  password: z.string().min(10).max(128).optional(),
  fullName: z.string().trim().max(200).optional(),
}).strict();

// The invited user arrives with a session from /auth/confirm (Supabase invite). The invitation
// token decides tenant/grade; role is always employee (accept_invitation).
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 4096));
  const db = await userDb();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) throw new HttpError(401, "UNAUTHENTICATED");
  if (input.password) {
    const pw = await db.auth.updateUser({ password: input.password });
    if (pw.error) throw new HttpError(400, "WEAK_PASSWORD");
  }
  const accepted = await db.rpc("accept_invitation", { p_token: input.token });
  if (accepted.error) databaseError(accepted.error);
  if (input.fullName) {
    // Own display name only; role/tenant columns are not touched (no browser write grant on users).
    const named = await db.rpc("set_own_name", { p_name: input.fullName });
    if (named.error) databaseError(named.error);
  }
  return json({ tenant_id: accepted.data }, 200);
}, { mutation: true });
