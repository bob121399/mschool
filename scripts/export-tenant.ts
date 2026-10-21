// Contract export of one tenant's learning records (spec 2.3 «доступ к экспорту для HR по договору»,
// 2.5 tenant deletion workflow step). Requires explicit tenant, operator superadmin id and intent;
// writes to .secrets/exports (gitignored) and records an admin audit entry. Raw learner answers are
// excluded unless --include-answers is passed; tutor dialogs are never exported.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { serviceClient } from "./lib/world";

if (existsSync(".env.local") && !process.env.SUPABASE_SECRET_KEY) loadEnvFile(".env.local");
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const tenant = arg("tenant");
  const actor = arg("actor");
  const confirm = arg("confirm");
  if (!tenant || !actor || confirm !== `EXPORT ${tenant}`) {
    throw new Error(`usage: --tenant <uuid> --actor <superadmin uuid> --confirm "EXPORT <uuid>"`);
  }
  const db = serviceClient();
  const sa = await db.from("users").select("role").eq("id", actor).single();
  if (sa.data?.role !== "superadmin") throw new Error("actor must be a superadmin");
  const answers = process.argv.includes("--include-answers");
  const q = async (table: string, cols: string) => {
    const r = await db.from(table as "users").select(cols).eq("tenant_id", tenant).limit(100000);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    return r.data;
  };
  const out = {
    exported_at: new Date().toISOString(),
    tenant: (await db.from("tenants").select("id,name,timezone").eq("id", tenant).single()).data,
    users: await q("users", "id,email,full_name,role,grade,status,department_id"),
    departments: await q("departments", "id,name"),
    courses: await q("courses", "id,title,target_grade,version,status,supersedes_id"),
    tracks: await q("tracks", "id,title,target_grade,version,status"),
    assignments: await q("assignments", "id,user_id,track_id,status,assigned_at,due_at,completed_at"),
    progress: await q("progress", "assignment_id,lesson_id,status,score,completed_at"),
    attempts: await q("assessment_attempts", answers ? "id,user_id,lesson_id,status,result,answer,created_at" : "id,user_id,lesson_id,status,result,created_at"),
    appeals: await q("assessment_appeals", "id,attempt_id,status,reason,decision,created_at"),
    overrides: await q("assessment_overrides", "attempt_id,reviewer_id,passed,score,reason,created_at"),
    hr_reports: await q("hr_reports", "period_start,period_end,metrics,narrative"),
    invoices: await q("invoices", "period_start,period_end,active_seats,amount_minor,currency,status,paid_at"),
  };
  mkdirSync(".secrets/exports", { recursive: true });
  const file = `.secrets/exports/tenant-${tenant}-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
  const audit = await db.from("admin_audit_logs").insert({ tenant_id: tenant, actor_id: actor, action: "export", object_type: "tenant",
    object_id: tenant, redacted_diff: { include_answers: answers } });
  if (audit.error) throw new Error(`audit: ${audit.error.message}`);
  console.log(JSON.stringify({ status: "ok", file }));
}

main().catch((e: unknown) => {
  console.error(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
