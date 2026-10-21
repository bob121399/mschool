import "server-only";
import { z } from "zod";
import { userDb, type UserDb } from "@/lib/supabase/server";
import { HttpError, databaseError } from "@/lib/http";

const profileSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid().nullable(),
  role: z.enum(["superadmin", "hr_admin", "employee"]),
  grade: z.enum(["junior", "middle", "senior", "head"]).nullable(),
  status: z.enum(["active", "suspended"]),
});
export type Profile = z.infer<typeof profileSchema>;
export type Role = Profile["role"];

export async function employeeContext() {
  const db = await userDb();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new HttpError(401, "UNAUTHENTICATED");
  const { data, error } = await db.from("users")
    .select("id,tenant_id,role,grade,status").eq("id", auth.user.id).maybeSingle();
  if (error) databaseError(error);
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success || parsed.data.status !== "active" || parsed.data.role !== "employee"
    || !parsed.data.tenant_id || !parsed.data.grade) throw new HttpError(403, "FORBIDDEN");
  return { db, userId: parsed.data.id, tenantId: parsed.data.tenant_id, grade: parsed.data.grade };
}

export const lessonContextSchema = z.object({
  tenant_id: z.uuid(), user_id: z.uuid(), assignment_id: z.uuid(), lesson_id: z.uuid(),
  course_id: z.uuid(), grade: z.enum(["junior", "middle", "senior", "head"]),
  title: z.string(), content: z.string(), assessment_question: z.string(),
  progress_status: z.enum(["in_progress", "completed"]), requires_assessment: z.boolean(),
});

export type SessionContext = {
  db: UserDb;
  userId: string;
  email: string;
  profile: Profile;
  aal: "aal1" | "aal2" | null;
};

/** Verified session + authoritative profile row (role/tenant from DB, never user_metadata). */
export async function sessionContext(): Promise<SessionContext> {
  const db = await userDb();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new HttpError(401, "UNAUTHENTICATED");
  const { data, error } = await db.from("users")
    .select("id,tenant_id,role,grade,status").eq("id", auth.user.id).maybeSingle();
  if (error) databaseError(error);
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success || parsed.data.status !== "active") throw new HttpError(403, "FORBIDDEN");
  const { data: aalData } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = aalData?.currentLevel === "aal2" ? "aal2" : aalData?.currentLevel === "aal1" ? "aal1" : null;
  return { db, userId: parsed.data.id, email: auth.user.email ?? "", profile: parsed.data, aal };
}

/** HR admin of own tenant. Superadmin uses superadminContext with an explicit tenant. */
export async function hrContext() {
  const ctx = await sessionContext();
  if (ctx.profile.role !== "hr_admin" || !ctx.profile.tenant_id) throw new HttpError(403, "FORBIDDEN");
  return { ...ctx, tenantId: ctx.profile.tenant_id };
}

/** Superadmin with MFA (AAL2). The database enforces AAL2 as well (private.is_superadmin). */
export async function superadminContext() {
  const ctx = await sessionContext();
  if (ctx.profile.role !== "superadmin") throw new HttpError(403, "FORBIDDEN");
  if (ctx.aal !== "aal2") throw new HttpError(403, "MFA_REQUIRED");
  return ctx;
}

/** Any active tenant member (support tickets). */
export async function tenantMemberContext() {
  const ctx = await sessionContext();
  if (!ctx.profile.tenant_id) throw new HttpError(403, "FORBIDDEN");
  return { ...ctx, tenantId: ctx.profile.tenant_id };
}
