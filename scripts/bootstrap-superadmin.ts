// Protected bootstrap of a superadmin (spec 6 step 2.7). Never promotes "the first user".
// Usage:
//   npm run bootstrap:superadmin -- --project-ref <ref|local> --auth-user <uuid> \
//     --confirm "PROMOTE <uuid> TO SUPERADMIN ON <ref>"
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY of the target project in the environment.
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { loadEnvFile } from "node:process";
import { serviceClient, supabaseEnv } from "./lib/world";

if (existsSync(".env.local") && !process.env.SUPABASE_SECRET_KEY) loadEnvFile(".env.local");

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

async function main() {
  const projectRef = arg("project-ref");
  const authUser = arg("auth-user");
  const confirm = arg("confirm");
  if (!/^[0-9a-f-]{36}$/u.test(authUser)) throw new Error("auth-user must be a UUID");
  const expected = `PROMOTE ${authUser} TO SUPERADMIN ON ${projectRef}`;
  if (confirm !== expected) throw new Error(`operator intent mismatch; expected --confirm "${expected}"`);
  const host = new URL(supabaseEnv().url).hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (projectRef === "local" ? !local : host !== `${projectRef}.supabase.co`) {
    throw new Error(`project ref ${projectRef} does not match NEXT_PUBLIC_SUPABASE_URL host ${host}`);
  }
  const admin = serviceClient();
  const { data: auth, error } = await admin.auth.admin.getUserById(authUser);
  if (error || !auth.user) throw new Error("auth user not found");
  if (!auth.user.email_confirmed_at) throw new Error("auth user email is not verified");
  const existing = await admin.from("users").select("role").eq("id", authUser).maybeSingle();
  if (existing.data && existing.data.role !== "superadmin") {
    throw new Error("user already has a tenant profile; superadmin accounts must be separate");
  }
  if (!existing.data) {
    const ins = await admin.from("users").insert({ id: authUser, tenant_id: null, email: auth.user.email!.toLowerCase(),
      role: "superadmin", grade: null, full_name: "Superadmin" });
    if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);
  }
  const audit = await admin.from("admin_audit_logs").insert({ tenant_id: null, actor_id: authUser,
    action: "bootstrap_superadmin", object_type: "user", object_id: authUser,
    redacted_diff: { operator: userInfo().username, project_ref: projectRef, mfa_required: true } });
  if (audit.error) throw new Error(`audit failed: ${audit.error.message}`);
  console.log(JSON.stringify({ status: "ok", user: authUser, note: "MFA (TOTP) enrollment is required at first login" }));
}

main().catch((e: unknown) => {
  console.error(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : "unknown" }));
  process.exit(1);
});
