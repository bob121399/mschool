// TEST-ONLY fake provider: intercepts fetch to api.openai.com inside the Vitest process. Production
// code has no switch to select it (spec step 5.5 / 6.7). Every other host passes through.
import { testEmbedding } from "../../scripts/lib/test-embedding";

type Scripted =
  | { kind: "json"; value: unknown; status?: "completed" | "incomplete"; usage?: { input_tokens: number; output_tokens: number } }
  | { kind: "refusal" } | { kind: "http"; status: number } | { kind: "network" } | { kind: "raw"; text: string };

const queue: Scripted[] = [];
export const calls: { path: string; body: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;

export function scriptResponses(...items: Scripted[]) { queue.push(...items); }
export function resetFake() { queue.length = 0; calls.length = 0; }

export function installFakeOpenAI() {
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_TUTOR_MODEL = "test-tutor-model";
  process.env.OPENAI_ASSESSOR_MODEL = "test-assessor-model";
  process.env.OPENAI_WORKER_MODEL = "test-worker-model";
  process.env.OPENAI_EMBEDDING_MODEL = "test-hash-embedding-v1";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.openai.com/")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const path = new URL(url).pathname;
    calls.push({ path, body });
    if (path === "/v1/embeddings") {
      const inputs = Array.isArray(body.input) ? body.input as string[] : [String(body.input)];
      return Response.json({ data: inputs.map((t, index) => ({ index, embedding: JSON.parse(testEmbedding(t)) as number[] })),
        usage: { total_tokens: inputs.join(" ").length } });
    }
    const next = queue.shift();
    if (!next) throw new Error("fake-openai: no scripted response");
    if (next.kind === "network") throw new TypeError("fetch failed");
    if (next.kind === "http") return new Response("{}", { status: next.status });
    if (next.kind === "raw") return Response.json({ id: "resp_test", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: next.text }] }] });
    if (next.kind === "refusal") return Response.json({ id: "resp_test", status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] });
    return Response.json({ id: `resp_${calls.length}`, status: next.status ?? "completed", usage: next.usage ?? { input_tokens: 100, output_tokens: 50 },
      output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(next.value) }] }] });
  }) as typeof fetch;
}
