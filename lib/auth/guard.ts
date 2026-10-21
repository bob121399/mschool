import "server-only";
import { redirect } from "next/navigation";
import { HttpError } from "@/lib/http";
import { hrContext, sessionContext, superadminContext } from "@/lib/auth/context";

// Server layouts/pages repeat authorization independently of the proxy (spec step 4.3).
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "MFA_REQUIRED") redirect("/mfa");
      if (error.status === 403) redirect("/forbidden");
      if (error.status === 404) redirect("/forbidden");
    }
    throw error;
  }
}

export const requireHr = () => guarded(hrContext);
export const requireSuperadmin = () => guarded(superadminContext);
export const requireEmployee = () => guarded(async () => {
  const ctx = await sessionContext();
  if (ctx.profile.role !== "employee" || !ctx.profile.tenant_id || !ctx.profile.grade) throw new HttpError(403, "FORBIDDEN");
  return { ...ctx, tenantId: ctx.profile.tenant_id, grade: ctx.profile.grade };
});
export const requireTenantMember = () => guarded(async () => {
  const ctx = await sessionContext();
  if (!ctx.profile.tenant_id) throw new HttpError(403, "FORBIDDEN");
  return { ...ctx, tenantId: ctx.profile.tenant_id };
});
