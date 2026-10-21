import { describe, expect, it } from "vitest";
import { aiCogs, arr, cacPayback, customerRoi, grossMargin, grr, ltvBounded, ltvSteady, monthlyCharge, mrrForMonth, nrr, ratio } from "@/lib/billing/metrics";

describe("Section 1.3 unit economics examples", () => {
  it("base scenario", () => {
    expect(arr(30000 * 100)).toBe(360000 * 100);
    expect(grossMargin(1500, 300)).toBeCloseTo(0.8);
    expect(cacPayback(4500, 1500, 0.8)).toBeCloseTo(3.75);
    expect(ltvSteady(1500, 0.8, 0.02)).toBeCloseTo(60000);
    expect(Math.round(ltvBounded(1500, 0.8, 0.02, 24))).toBe(23053);
    expect(ltvBounded(1500, 0.8, 0.02) / 4500).toBeCloseTo(5.12, 2);
  });
  it("conservative and scaling scenarios", () => {
    expect(grossMargin(800, 280)).toBeCloseTo(0.65);
    expect(cacPayback(5500, 800, 0.65)).toBeCloseTo(10.58, 2);
    expect(ltvSteady(800, 0.65, 0.04)! / 5500).toBeCloseTo(2.36, 2);
    expect(cacPayback(6000, 2400, 0.8)).toBeCloseTo(3.125, 3);
    expect(ltvSteady(2400, 0.8, 0.015)! / 6000).toBeCloseTo(21.33, 2);
  });
  it("N/A on zero denominators", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(nrr(new Map(), new Map())).toBeNull();
  });
});

describe("BILL-03 NRR cohort excludes new logos; memo example = 125%", () => {
  it("125% NRR and 90% GRR", () => {
    // $20 000 start: A expands +7 000, B contracts −1 000, C churns −1 000.
    const start = new Map([["A", 10000], ["B", 9000], ["C", 1000]]);
    const end = new Map([["A", 17000], ["B", 8000], ["NEW", 50000]]);
    expect(nrr(start, end)).toBeCloseTo(1.25);
    expect(grr(start, end)).toBeCloseTo(0.9);
  });
});

describe("BILL-01/02 charge and normalized MRR", () => {
  it("Start/Growth use max(seats × price, minimum); Enterprise fixed", () => {
    expect(monthlyCharge("start", 10, 600, 30000)).toBe(30000);
    expect(monthlyCharge("growth", 300, 500, 100000)).toBe(150000);
    expect(monthlyCharge("enterprise", 9999, 0, 250000)).toBe(250000);
  });
  it("annual prepayment normalized; one-off, trial(draft), void, demo and other currency excluded", () => {
    const base = { period_start: "2026-09-01", period_end: "2026-10-01", is_demo: false };
    const rows = [
      { ...base, tenant_id: "a", amount_minor: 150000, currency: "USD", status: "paid" },
      { ...base, tenant_id: "b", period_end: "2027-09-01", amount_minor: 1200000, currency: "USD", status: "paid", months_covered: 12 },
      { ...base, tenant_id: "c", amount_minor: 300000, currency: "USD", status: "paid", one_off: true },
      { ...base, tenant_id: "d", amount_minor: 99999, currency: "USD", status: "draft" },
      { ...base, tenant_id: "e", amount_minor: 50000, currency: "USD", status: "void" },
      { ...base, tenant_id: "f", amount_minor: 70000, currency: "USD", status: "paid", is_demo: true },
      { ...base, tenant_id: "g", amount_minor: 1000000, currency: "UZS", status: "issued" },
      { ...base, tenant_id: "h", amount_minor: 30000, currency: "USD", status: "issued" }, // overdue issued still revenue of the month
    ];
    expect(mrrForMonth(rows, "2026-09-01", "USD")).toBe(150000 + 100000 + 30000);
    expect(mrrForMonth(rows, "2026-09-01", "UZS")).toBe(1000000);
  });
});

describe("Section 1.4 ROI illustration", () => {
  it("reproduces 70% released, $1 800 net, 79.49% ROI, 1.67 months payback", () => {
    const r = customerRoi({
      operations: [{ baseline_hours: 1000, hourly_cost: 10, automation_share: 0.8, control_hours: 100, cash_realization: 0.5 }],
      contractor_savings: 0, subscription: 1500, extra_operations: 200, implementation: 3000,
    });
    expect(r.releasedValue).toBeCloseTo(7000);
    expect(r.releasedShareOfSelectedPayroll).toBeCloseTo(0.7);
    expect(r.cashPayrollSaving).toBeCloseTo(3500);
    expect(r.netMonthlyBenefit).toBeCloseTo(1800);
    expect(r.roi12m! * 100).toBeCloseTo(79.49, 2);
    expect(r.implementationPayback).toBeCloseTo(1.67, 2);
    expect(7000 / 30000).toBeCloseTo(0.2333, 4);
  });
  it("no cash realization → negative cash ROI and no payback", () => {
    const r = customerRoi({ operations: [{ baseline_hours: 1000, hourly_cost: 10, automation_share: 0.8, control_hours: 100, cash_realization: 0 }],
      contractor_savings: 0, subscription: 1500, extra_operations: 200, implementation: 3000 });
    expect(r.roi12m!).toBeLessThan(0);
    expect(r.implementationPayback).toBeNull();
  });
});

describe("AI COGS", () => {
  it("unknown rate is not zero cost", () => {
    expect(aiCogs([{ input_tokens: 1000, output_tokens: 10 }], { input: null, output: 1, embedding: 0 })).toBeNull();
    expect(aiCogs([{ input_tokens: 1_000_000, output_tokens: 1_000_000 }], { input: 1, output: 4, embedding: null })).toBe(5);
  });
});
