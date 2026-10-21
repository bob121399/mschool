// Capability probe (spec 6 step 1.5 / 3.1): Structured Outputs on each configured model, output
// budget, and embedding length = 1536. Harmless payload; never logs secrets or response contents.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";

if (existsSync(".env.local")) loadEnvFile(".env.local");

async function main() {
  const missing = ["OPENAI_API_KEY", "OPENAI_TUTOR_MODEL", "OPENAI_ASSESSOR_MODEL", "OPENAI_WORKER_MODEL", "OPENAI_EMBEDDING_MODEL"]
    .filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.log(JSON.stringify({ status: "BLOCKED", reason: "missing configuration", missing }));
    process.exit(2);
  }
  const { responseJSON, embedding } = await import("../lib/ai/openai");
  const results: Record<string, string> = {};
  for (const name of ["OPENAI_TUTOR_MODEL", "OPENAI_ASSESSOR_MODEL", "OPENAI_WORKER_MODEL"] as const) {
    try {
      const r = await responseJSON({ model: process.env[name]!, instructions: "Return JSON {\"ok\": true}.", input: { ping: 1 },
        schemaName: "probe", jsonSchema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
        validator: z.object({ ok: z.boolean() }).strict(), maxOutputTokens: name === "OPENAI_ASSESSOR_MODEL" ? 5000 : 2500 });
      results[name] = r.value.ok === true ? (r.usage ? "ok" : "ok (usage missing)") : "unexpected";
    } catch (e) {
      results[name] = `failed:${(e as { code?: string }).code ?? "error"}`;
    }
  }
  try {
    const e = await embedding("probe");
    results.OPENAI_EMBEDDING_MODEL = (JSON.parse(e.vector) as number[]).length === 1536 ? "ok (1536)" : "wrong dimension";
  } catch (e) {
    results.OPENAI_EMBEDDING_MODEL = `failed:${(e as { code?: string }).code ?? "error"}`;
  }
  const ok = Object.values(results).every((v) => v.startsWith("ok"));
  console.log(JSON.stringify({ status: ok ? "OK" : "FAILED", results }));
  process.exit(ok ? 0 : 1);
}
void main();
