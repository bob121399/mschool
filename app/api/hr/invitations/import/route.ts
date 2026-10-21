import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, readJson } from "@/lib/http";
import { parseCsv } from "@/lib/csv";
import { inviteEmployee, type Grade } from "@/lib/hr/invitations";

export const dynamic = "force-dynamic";
const body = z.object({ mode: z.enum(["preview", "confirm"]), csv: z.string().min(1).max(200_000) }).strict();
const GRADES = new Set(["junior", "middle", "senior", "head"]);
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

type Row = { line: number; email: string; grade: string; department: string; errors: string[]; departmentId: string | null };

// Preview validates every row (≤500) without side effects; confirm sends invitations only for valid
// rows after an explicit HR submit and returns an accepted/rejected report.
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 256_000));
  const { db, tenantId } = await hrContext();
  let table: string[][];
  try { table = parseCsv(input.csv, 501); } catch { throw new HttpError(400, "TOO_MANY_ROWS"); }
  const header = table[0]?.map((h) => h.toLowerCase());
  const hasHeader = header?.includes("email") ?? false;
  const dataRows = hasHeader ? table.slice(1) : table;
  if (dataRows.length > 500) throw new HttpError(400, "TOO_MANY_ROWS");
  const idx = (name: string, fallback: number) => (hasHeader ? header!.indexOf(name) : fallback);
  const [ei, gi, di] = [idx("email", 0), idx("grade", 1), idx("department", 2)];
  const deps = await db.from("departments").select("id,name").eq("tenant_id", tenantId);
  if (deps.error) databaseError(deps.error);
  const depByName = new Map((deps.data ?? []).map((d) => [d.name.toLowerCase(), d.id]));
  const seen = new Set<string>();
  const emails = dataRows.map((r) => (r[ei] ?? "").toLowerCase());
  const existing = await db.from("users").select("email").in("email", emails.filter((e) => emailRe.test(e)).slice(0, 500));
  if (existing.error) databaseError(existing.error);
  const existingSet = new Set((existing.data ?? []).map((u) => u.email));
  const rows: Row[] = dataRows.map((r, i) => {
    const email = (r[ei] ?? "").toLowerCase();
    const grade = (r[gi] ?? "").toLowerCase();
    const department = di >= 0 ? (r[di] ?? "") : "";
    const errors: string[] = [];
    if (!emailRe.test(email) || email.length > 254) errors.push("INVALID_EMAIL");
    if (!GRADES.has(grade)) errors.push("INVALID_GRADE");
    if (seen.has(email)) errors.push("DUPLICATE_IN_FILE");
    if (existingSet.has(email)) errors.push("USER_EXISTS");
    const departmentId = department ? depByName.get(department.toLowerCase()) ?? null : null;
    if (department && !departmentId) errors.push("UNKNOWN_DEPARTMENT");
    seen.add(email);
    return { line: i + (hasHeader ? 2 : 1), email, grade, department, errors, departmentId };
  });
  if (input.mode === "preview") {
    return json({ total: rows.length, valid: rows.filter((r) => r.errors.length === 0).length,
      rows: rows.map(({ departmentId: _d, ...r }) => r) });
  }
  const report: { line: number; email: string; status: "accepted" | "rejected"; code?: string; delivery?: string }[] = [];
  for (const row of rows) {
    if (row.errors.length > 0) { report.push({ line: row.line, email: row.email, status: "rejected", code: row.errors[0] }); continue; }
    try {
      const r = await inviteEmployee(db, { email: row.email, grade: row.grade as Grade, departmentId: row.departmentId, tenantId });
      report.push({ line: row.line, email: row.email, status: "accepted", delivery: r.delivery });
    } catch (e) {
      report.push({ line: row.line, email: row.email, status: "rejected", code: e instanceof HttpError ? e.code : "INTERNAL_ERROR" });
    }
  }
  return json({ accepted: report.filter((r) => r.status === "accepted").length,
    rejected: report.filter((r) => r.status === "rejected").length, report });
}, { mutation: true });
