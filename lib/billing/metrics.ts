// Section 1.2–1.4 formulas. Pure functions; money in minor units of ONE currency per call.
// Zero denominators return null (shown as N/A), never 0 or Infinity.

export type Currency = "USD" | "UZS";
export type Tier = "start" | "growth" | "enterprise";

export const PRICE_CATALOG = {
  version: "model-2026-10",
  note: "Предлагаемый прайс для моделирования, не опубликованные тарифы (раздел 1.2). USD без налогов.",
  tiers: {
    start: { seat_price_minor: 600, minimum_monthly_minor: 30000, currency: "USD" as const,
      agents: ["course_creator", "tutor", "assessor", "hr_analyst"], services: ["support"],
      terms: "Один процесс онбординга; стандартная поддержка; согласованный лимит вычислений" },
    growth: { seat_price_minor: 500, minimum_monthly_minor: 100000, currency: "USD" as const,
      agents: ["course_creator", "tutor", "assessor", "hr_analyst"], services: ["support"],
      terms: "От 200 активных мест; несколько подразделений; аналитика; настройка рубрик" },
    enterprise: { seat_price_minor: 0, minimum_monthly_minor: 250000, currency: "USD" as const,
      agents: ["course_creator", "tutor", "assessor", "hr_analyst"], services: ["support", "product_analyst", "sales"],
      terms: "Годовой договор; фиксированная сумма от $2 500/мес.; fair use, SLA и бюджет вычислений по договору" },
  },
} as const;

/** max(active_seats × seat_price, minimum) for Start/Growth; fixed contract fee for Enterprise. */
export function monthlyCharge(tier: Tier, activeSeats: number, seatPriceMinor: number, minimumMinor: number): number {
  if (!Number.isInteger(activeSeats) || activeSeats < 0) throw new Error("INVALID_SEATS");
  if (tier === "enterprise") return minimumMinor;
  return Math.max(activeSeats * seatPriceMinor, minimumMinor);
}

export type InvoiceRow = {
  tenant_id: string; period_start: string; period_end: string; amount_minor: number; currency: string;
  status: string; is_demo: boolean; months_covered?: number; one_off?: boolean;
};

/** MRR of a closed month: issued/paid recurring invoices normalized to one month; demo, void,
 * one-off and draft excluded; one currency only (no FX summing). */
export function mrrForMonth(invoices: InvoiceRow[], monthStart: string, currency: Currency): number {
  return invoices
    .filter((i) => i.currency === currency && !i.is_demo && !i.one_off && (i.status === "issued" || i.status === "paid"))
    .filter((i) => i.period_start <= monthStart && i.period_end > monthStart)
    .reduce((sum, i) => sum + Math.round(i.amount_minor / Math.max(1, i.months_covered ?? 1)), 0);
}

export const arr = (mrr: number) => mrr * 12;

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** NRR = (start MRR + expansion + price uplift − contraction − churn) / start MRR; new logos excluded. */
export function nrr(cohortStart: Map<string, number>, cohortEnd: Map<string, number>): number | null {
  let start = 0;
  let end = 0;
  for (const [tenant, value] of cohortStart) {
    start += value;
    end += cohortEnd.get(tenant) ?? 0; // churned → 0; tenants absent at start (new) are ignored
  }
  return ratio(end, start);
}

/** GRR caps each customer at its starting MRR (no expansion). */
export function grr(cohortStart: Map<string, number>, cohortEnd: Map<string, number>): number | null {
  let start = 0;
  let kept = 0;
  for (const [tenant, value] of cohortStart) {
    start += value;
    kept += Math.min(value, cohortEnd.get(tenant) ?? 0);
  }
  return ratio(kept, start);
}

export function grossMargin(mrr: number, cogs: number): number | null {
  return ratio(mrr - cogs, mrr);
}

export function cacPayback(cac: number, arpa: number, gm: number): number | null {
  return ratio(cac, arpa * gm);
}

/** Gross-profit LTV under stationary assumptions (not proof of lifetime value). */
export function ltvSteady(arpa: number, gm: number, monthlyChurn: number): number | null {
  return ratio(arpa * gm, monthlyChurn);
}

/** LTV bounded to N months, undiscounted: ARPA × GM × Σ_{t=0}^{N-1} (1 − churn)^t. */
export function ltvBounded(arpa: number, gm: number, monthlyChurn: number, months = 24): number {
  let factor = 0;
  for (let t = 0; t < months; t += 1) factor += (1 - monthlyChurn) ** t;
  return arpa * gm * factor;
}

/** AI COGS; an unknown rate is not zero cost → returns null. */
export function aiCogs(rows: { input_tokens: number; output_tokens: number; embedding_tokens?: number }[],
  rates: { input: number | null; output: number | null; embedding: number | null }, ocr = 0): number | null {
  if (rates.input === null || rates.output === null) return null;
  let total = 0;
  for (const r of rows) {
    if ((r.embedding_tokens ?? 0) > 0 && rates.embedding === null) return null;
    total += r.input_tokens * rates.input + r.output_tokens * rates.output + (r.embedding_tokens ?? 0) * (rates.embedding ?? 0);
  }
  return total / 1_000_000 + ocr;
}

export type RoiOperation = { baseline_hours: number; hourly_cost: number; automation_share: number;
  control_hours: number; cash_realization: number };

/** Section 1.4 customer ROI. Released value ≠ cash saving; inputs validated by the caller. */
export function customerRoi(input: { operations: RoiOperation[]; contractor_savings: number; subscription: number;
  extra_operations: number; implementation: number }) {
  for (const op of input.operations) {
    for (const v of Object.values(op)) if (!Number.isFinite(v) || v < 0) throw new Error("INVALID_ROI_INPUT");
    if (op.automation_share > 1 || op.cash_realization > 1) throw new Error("INVALID_ROI_INPUT");
  }
  const released = input.operations.map((op) => op.baseline_hours * op.hourly_cost * op.automation_share - op.control_hours * op.hourly_cost);
  const releasedValue = released.reduce((a, b) => a + b, 0);
  const cashPayrollSaving = input.operations.reduce((sum, op, i) => sum + released[i]! * op.cash_realization, 0);
  const netMonthlyBenefit = cashPayrollSaving + input.contractor_savings - input.subscription - input.extra_operations;
  const costs = 12 * input.subscription + 12 * input.extra_operations + input.implementation;
  const roi12m = ratio(12 * netMonthlyBenefit - input.implementation, costs);
  const implementationPayback = netMonthlyBenefit > 0 ? input.implementation / netMonthlyBenefit : null;
  const baselinePayroll = input.operations.reduce((s, op) => s + op.baseline_hours * op.hourly_cost, 0);
  return { releasedValue, releasedShareOfSelectedPayroll: ratio(releasedValue, baselinePayroll), cashPayrollSaving,
    netMonthlyBenefit, roi12m, implementationPayback };
}
