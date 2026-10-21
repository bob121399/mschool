import { z } from "zod";
import { randomUUID } from "node:crypto";
import { superadminContext } from "@/lib/auth/context";
import { adminDb } from "@/lib/supabase/admin";
import { requiredEnv } from "@/lib/config";
import { HttpError, databaseError, json, publicError, readJson, requireOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

// Trial invitation for a verified lead after review (explicit superadmin submit). The lead then
// confirms email and creates the trial via /onboarding (provision_tenant); no tenant is created here.
export async function POST(request: Request, ctx: RouteContext<"/api/superadmin/leads/[id]/invite">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const input = body.parse(await readJson(request, 1024));
    const { db, userId } = await superadminContext();
    const lead = await db.from("leads").select("id,email,consent_at,status").eq("id", id).maybeSingle();
    if (lead.error) databaseError(lead.error);
    if (!lead.data) throw new HttpError(404, "NOT_FOUND");
    if (!lead.data.consent_at) throw new HttpError(409, "CONSENT_REQUIRED");
    const admin = adminDb();
    const sent = await admin.auth.admin.inviteUserByEmail(lead.data.email, {
      redirectTo: `${new URL(requiredEnv("APP_ORIGIN")).origin}/onboarding`,
    });
    if (sent.error && !/already|registered|exists/iu.test(sent.error.message)) throw new HttpError(502, "INVITE_DELIVERY_FAILED");
    const audit = await admin.from("admin_audit_logs").insert({ tenant_id: null, actor_id: userId, action: "invite_lead",
      object_type: "lead", object_id: id, redacted_diff: { reason: input.reason } });
    if (audit.error) databaseError(audit.error);
    return json({ delivery: sent.error ? "existing_account" : "sent" });
  } catch (error) {
    return publicError(error, traceId);
  }
}
