import "server-only";
import type { UserDb } from "@/lib/supabase/server";
import { databaseError } from "@/lib/http";
import { mrrForMonth, nrr, grr, type Currency } from "@/lib/billing/metrics";

export type PlatformMetrics = {
  month: string; cutoff: string; currency: Currency;
  mrr_minor: number | null; arr_minor: number | null; paying_tenants: number; active_seats: number | null;
  prev_mrr_minor: number | null; nrr: number | null; grr: number | null;
  bridge: { start: number; new: number; expansion: number; contraction: number; churn: number; end: number } | null;
  tenants_total: number; tenants_demo: number; jobs_pending: number; ai_errors_month: number;
};

/** Deterministic platform metrics from invoices (closed month), demo excluded (spec 4.3/5.4). */
export async function platformMetrics(db: UserDb, month: string, currency: Currency): Promise<PlatformMetrics> {
  const start = `${month}-01`;
  const prev = new Date(`${start}T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevStart = prev.toISOString().slice(0, 10);
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const [inv, tenants, jobs, aiErrors] = await Promise.all([
    db.from("invoices").select("tenant_id,period_start,period_end,amount_minor,currency,status,active_seats,tenants(is_demo)")
      .gte("period_start", prevStart).lt("period_start", end.toISOString().slice(0, 10)).limit(10000),
    db.from("tenants").select("id,is_demo"),
    db.from("agent_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
    db.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed")
      .gte("created_at", `${start}T00:00:00Z`).lt("created_at", end.toISOString()),
  ]);
  if (inv.error) databaseError(inv.error);
  if (tenants.error) databaseError(tenants.error);
  const rows = (inv.data ?? []).map((r) => ({ ...r, is_demo: Boolean((r.tenants as { is_demo: boolean } | null)?.is_demo) }));
  const perTenant = (monthStart: string) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.is_demo || r.currency !== currency || !(r.status === "issued" || r.status === "paid")) continue;
      if (r.period_start <= monthStart && r.period_end > monthStart) map.set(r.tenant_id, (map.get(r.tenant_id) ?? 0) + r.amount_minor);
    }
    return map;
  };
  const cur = perTenant(start);
  const before = perTenant(prevStart);
  const mrr = rows.length === 0 ? null : mrrForMonth(rows, start, currency);
  const prevMrr = rows.length === 0 ? null : mrrForMonth(rows, prevStart, currency);
  let bridge: PlatformMetrics["bridge"] = null;
  if (mrr !== null && prevMrr !== null) {
    let expansion = 0, contraction = 0, churn = 0, added = 0;
    for (const [t, v] of before) {
      const now = cur.get(t) ?? 0;
      if (now === 0) churn += v; else if (now > v) expansion += now - v; else contraction += v - now;
    }
    for (const [t, v] of cur) if (!before.has(t)) added += v;
    bridge = { start: prevMrr, new: added, expansion, contraction, churn, end: mrr };
  }
  const seatRows = rows.filter((r) => !r.is_demo && r.period_start === start && (r.status === "issued" || r.status === "paid"));
  return {
    month, cutoff: new Date().toISOString(), currency,
    mrr_minor: mrr, arr_minor: mrr === null ? null : mrr * 12, paying_tenants: cur.size,
    active_seats: seatRows.length ? seatRows.reduce((s, r) => s + r.active_seats, 0) : null,
    prev_mrr_minor: prevMrr, nrr: before.size ? nrr(before, cur) : null, grr: before.size ? grr(before, cur) : null, bridge,
    tenants_total: tenants.data?.length ?? 0, tenants_demo: (tenants.data ?? []).filter((t) => t.is_demo).length,
    jobs_pending: jobs.count ?? 0, ai_errors_month: aiErrors.count ?? 0,
  };
}
