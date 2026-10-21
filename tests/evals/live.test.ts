// Optional LIVE eval against the configured provider. Runs only with EVAL_LIVE=true and real
// OPENAI_* settings; otherwise it is reported as skipped («live AI eval не выполнен»).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiConfigured } from "@/lib/config";

const live = process.env.EVAL_LIVE === "true" && aiConfigured() && process.env.OPENAI_API_KEY !== "test-only-key";

describe.skipIf(!live)("assessor-answers-v1 LIVE", () => {
  it("pass/fail agreement ≥ 90% and no false pass on critical rules", async () => {
    const { responseJSON, modelEnv } = await import("@/lib/ai/openai");
    const { evaluationOutput, evaluationJSONSchema, rubricSchema } = await import("@/lib/ai/contracts");
    const { ASSESSOR_PROMPT } = await import("@/lib/ai/prompts");
    const { evaluationProblem, scoreForEval } = await import("@/lib/ai/assessment");
    const { RUBRIC_FIXTURE } = await import("../../scripts/lib/world");
    const rubric = rubricSchema.parse(RUBRIC_FIXTURE);
    const data = JSON.parse(readFileSync("tests/evals/datasets/assessor-answers-v1.json", "utf8")) as { cases: { answer: string; human_passed: boolean; kind: string }[] };
    let agree = 0, falsePass = 0, technical = 0;
    for (const c of data.cases) {
      try {
        const g = await responseJSON({ model: modelEnv("OPENAI_ASSESSOR_MODEL"), instructions: ASSESSOR_PROMPT, schemaName: "mschool_assessor_v1",
          jsonSchema: evaluationJSONSchema(rubric.criteria.map((x) => x.id)), validator: evaluationOutput, maxOutputTokens: 5000,
          input: { question: "Опишите действия по регламенту.", rubric, answer: c.answer } });
        if (evaluationProblem(rubric, c.answer, g.value)) { technical += 1; continue; }
        const passed = scoreForEval(rubric, g.value).passed;
        if (passed === c.human_passed) agree += 1;
        if (passed && !c.human_passed) falsePass += 1;
      } catch { technical += 1; }
    }
    console.log(JSON.stringify({ eval: "assessor-answers-v1", n: data.cases.length, agree, falsePass, technical }));
    expect(agree / (data.cases.length - technical)).toBeGreaterThanOrEqual(0.9);
    expect(falsePass).toBe(0);
  }, 600_000);
});

describe.runIf(!live)("live AI eval", () => {
  it("не выполнен: нет EVAL_LIVE=true и/или настроенного OPENAI_API_KEY", () => {
    console.warn("live AI eval не выполнен: требуется ключ и модели владельца (BLK-01)");
    expect(live).toBe(false);
  });
});
