import "server-only";
import type { UserDb } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { requiredEnv } from "@/lib/config";
import { HttpError, databaseError } from "@/lib/http";

export type Grade = "junior" | "middle" | "senior" | "head";
export type InviteResult = { email: string; invitation_id: string; delivery: "sent" | "existing_account"; accept_path?: string };

/** Creates/rotates the invitation under the HR's session (SECURITY DEFINER RPC checks scope),
 * then asks Supabase Auth to send the invite. Called only after an explicit HR submit. */
export async function inviteEmployee(db: UserDb, input: { email: string; grade: Grade; departmentId: string | null; tenantId: string }): Promise<InviteResult> {
  const { data, error } = await db.rpc("create_invitation", {
    p_tenant: input.tenantId, p_email: input.email, p_grade: input.grade,
    p_department: input.departmentId ?? undefined,
  });
  if (error) databaseError(error);
  const inv = data as { invitation_id: string; email: string; token: string };
  const acceptPath = `/invite/accept?token=${inv.token}`;
  const sent = await adminDb().auth.admin.inviteUserByEmail(inv.email, {
    redirectTo: `${new URL(requiredEnv("APP_ORIGIN")).origin}${acceptPath}`,
  });
  if (sent.error) {
    // An Auth account may already exist (e.g. self-signup without a profile): the person signs in
    // and opens the accept link; HR shares it through a channel it controls.
    if (/already|registered|exists/iu.test(sent.error.message)) {
      return { email: inv.email, invitation_id: inv.invitation_id, delivery: "existing_account", accept_path: acceptPath };
    }
    throw new HttpError(502, "INVITE_DELIVERY_FAILED");
  }
  return { email: inv.email, invitation_id: inv.invitation_id, delivery: "sent" };
}
