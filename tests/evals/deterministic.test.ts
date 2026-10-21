// Deterministic eval fixtures (spec 3.x, step 6.7 `test:evals`). They check the SERVER pipeline
// around model outputs: validation, scoring authority, citations, guards and ROI math. They do not
// prove model quality — that is the optional live part (live.test.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluationProblem, scoreForEval } from "@/lib/ai/assessment";
import { citationProblem } from "@/lib/ai/citations";
import { salesTextProblems, supportTextProblems } from "@/lib/ai/guards";
import { evaluationOutput, rubricSchema } from "@/lib/ai/contracts";
import { customerRoi } from "@/lib/billing/metrics";
import { courseDraftOutput } from "@/prompts";
import { rubricProblems } from "@/lib/ai/contracts";
import { RUBRIC_FIXTURE } from "../../scripts/lib/world";

type Case = { id: string; kind: string; answer: string; human_passed: boolean; fixture_output: unknown; expect: "pass" | "fail" | "reject" };
const assessor = JSON.parse(readFileSync("tests/evals/datasets/assessor-answers-v1.json", "utf8")) as { cases: Case[] };
const rubric = rubricSchema.parse(RUBRIC_FIXTURE);

describe("assessor-answers-v1 (server pipeline over recorded outputs)", () => {
  const outcomes = assessor.cases.map((c) => {
    const parsed = evaluationOutput.safeParse(c.fixture_output);
    if (!parsed.success) return { c, outcome: "reject" as const };
    if (evaluationProblem(rubric, c.answer, parsed.data)) return { c, outcome: "reject" as const };
    return { c, outcome: scoreForEval(rubric, parsed.data).passed ? "pass" as const : "fail" as const };
  });
  for (const { c, outcome } of outcomes) {
    it(`${c.id} ${c.kind} → ${c.expect}`, () => expect(outcome).toBe(c.expect));
  }
  it("no false pass against human labels; rejected outputs never complete a lesson", () => {
    const falsePass = outcomes.filter((o) => o.outcome === "pass" && !o.c.human_passed);
    expect(falsePass).toEqual([]);
    const agreement = outcomes.filter((o) => o.outcome !== "reject").filter((o) => (o.outcome === "pass") === o.c.human_passed).length
      / outcomes.filter((o) => o.outcome !== "reject").length;
    expect(agreement).toBeGreaterThanOrEqual(0.9);
  });
});

describe("tutor citations (RAG-01/02)", () => {
  const allowed = new Set(["lesson:1", "chunk-a"]);
  it.each([
    [["lesson:1"], false, null], [["chunk-a", "lesson:1"], false, null], [[], true, null],
    [[], false, "AI_INVALID_CITATIONS"], [["chunk-b"], false, "AI_INVALID_CITATIONS"], [["https://evil.example"], true, "AI_INVALID_CITATIONS"],
  ] as const)("%j insufficient=%s → %s", (ids, insufficient, expected) => {
    expect(citationProblem([...ids], allowed, insufficient)).toBe(expected);
  });
});

describe("sales-leads-v1: ROI from the code calculator (never from the model)", () => {
  const data = JSON.parse(readFileSync("tests/evals/datasets/sales-leads-v1.json", "utf8")) as {
    leads: { id: string; inputs: Record<string, number>; expected: Record<string, number | null> }[]; forbidden_texts: string[]; allowed_texts: string[] };
  for (const lead of data.leads) {
    it(`${lead.id} matches section 1.4 formulas`, () => {
      const i = lead.inputs as Record<string, number>;
      const r = customerRoi({ operations: [{ baseline_hours: i.baseline_hours!, hourly_cost: i.hourly_cost_usd!, automation_share: i.automation_share!,
        control_hours: i.control_hours!, cash_realization: i.cash_realization! }], contractor_savings: 0, subscription: i.subscription_usd!,
        extra_operations: 0, implementation: i.implementation_usd! });
      for (const k of ["releasedValue", "cashPayrollSaving", "netMonthlyBenefit", "roi12m"] as const) expect(r[k]).toBeCloseTo(lead.expected[k] as number, 6);
      if (lead.expected.implementationPayback === null) expect(r.implementationPayback).toBeNull();
      else expect(r.implementationPayback).toBeCloseTo(lead.expected.implementationPayback!, 6);
    });
  }
  it("guards block partnership/70%/unlimited claims and allow neutral wording", () => {
    for (const t of data.forbidden_texts) expect(salesTextProblems(t).length).toBeGreaterThan(0);
    for (const t of data.allowed_texts) expect(salesTextProblems(t)).toEqual([]);
  });
});

describe("support guard: never claims to have changed billing/roles", () => {
  it.each([["Я изменил счет, теперь он оплачен.", 1], ["Счет отмечен как оплаченный.", 1], ["Передал запрос оператору по оплате.", 0]] as const)("%s", (t, n) => {
    expect(supportTextProblems(t).length).toBe(n);
  });
});

describe("course creator draft validation", () => {
  it("rejects rubric weights ≠ 100 and critical without min", () => {
    expect(rubricProblems({ passing_score: 80, criteria: [{ id: "C1", description: "d", max_points: 90, critical: false, min_points: 0, reference: "r" }] }))
      .toContain("WEIGHTS_MUST_SUM_100");
    expect(rubricProblems({ passing_score: 80, criteria: [{ id: "C1", description: "d", max_points: 100, critical: true, min_points: 0, reference: "r" }] }))
      .toContain("CRITICAL_WITHOUT_MIN:C1");
  });
  it("strict schema rejects extra fields (e.g. a model trying to publish)", () => {
    const r = courseDraftOutput.safeParse({ course_title: "x", description: "", grade: "junior", objectives: [], modules: [], coverage_gaps: [], publish: true });
    expect(r.success).toBe(false);
  });
});
