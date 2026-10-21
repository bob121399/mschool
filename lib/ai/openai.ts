import "server-only";
import { z } from "zod";
import { optionalEnv, requiredEnv } from "@/lib/config";
import { HttpError } from "@/lib/http";

const envelopeSchema = z.object({
  id: z.string(), status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() })).optional(),
  })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).optional(),
});

// ERRATA E-TS-08: a missing key surfaced as a generic 500 (thrown Error); it is now an explicit
// 503 AI_NOT_CONFIGURED so the UI can say the integration is blocked, never a fake answer.
function apiKey(): string {
  const key = optionalEnv("OPENAI_API_KEY");
  if (!key) throw new HttpError(503, "AI_NOT_CONFIGURED");
  return key;
}

export function modelEnv(name: "OPENAI_TUTOR_MODEL" | "OPENAI_ASSESSOR_MODEL" | "OPENAI_WORKER_MODEL"): string {
  const value = optionalEnv(name);
  if (!value) throw new HttpError(503, "AI_NOT_CONFIGURED");
  return value;
}

async function providerPost(path: "responses" | "embeddings", payload: unknown, timeoutMs: number) {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new HttpError(503, "AI_UNAVAILABLE");
  }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new HttpError(503, "AI_BUSY");
    throw new HttpError(502, "AI_PROVIDER_ERROR");
  }
  try { return await response.json() as unknown; }
  catch { throw new HttpError(502, "AI_INVALID_RESPONSE"); }
}

export type AiUsage = { input_tokens: number; output_tokens: number } | null;

export async function responseJSON<T>(args: {
  model: string; instructions: string; input: unknown; schemaName: string;
  jsonSchema: Record<string, unknown>; validator: z.ZodType<T>; maxOutputTokens: number;
  timeoutMs?: number;
}) {
  const raw = await providerPost("responses", {
    model: args.model, instructions: args.instructions, store: false,
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(args.input) }] }],
    text: { format: { type: "json_schema", name: args.schemaName, strict: true, schema: args.jsonSchema } },
    max_output_tokens: args.maxOutputTokens,
  }, args.timeoutMs ?? 35000);
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(502, "AI_INVALID_RESPONSE");
  const response = parsed.data;
  if (response.status !== "completed") throw new HttpError(502, "AI_INCOMPLETE");
  const fragments: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "refusal") throw new HttpError(422, "AI_REFUSED");
      if (part.type === "output_text" && typeof part.text === "string") fragments.push(part.text);
    }
  }
  let value: unknown;
  try { value = JSON.parse(fragments.join("")) as unknown; }
  catch { throw new HttpError(502, "AI_INVALID_JSON"); }
  const checked = args.validator.safeParse(value);
  if (!checked.success) throw new HttpError(502, "AI_SCHEMA_MISMATCH");
  return { value: checked.data, responseId: response.id, usage: (response.usage ?? null) as AiUsage };
}

export async function embedding(text: string) {
  const model = requiredEnv("OPENAI_EMBEDDING_MODEL");
  const raw = await providerPost("embeddings", { model, input: text, dimensions: 1536 }, 10000);
  const parsed = z.object({
    data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).length(1536) })),
    usage: z.object({ total_tokens: z.number().int().nonnegative() }).optional(),
  }).safeParse(raw);
  if (!parsed.success) throw new HttpError(502, "EMBEDDING_INVALID");
  const vector = parsed.data.data.find((item) => item.index === 0)?.embedding;
  if (!vector || vector.every((value) => value === 0)) throw new HttpError(502, "EMBEDDING_INVALID");
  return { model, vector: JSON.stringify(vector), usage: parsed.data.usage ?? null };
}

/** Batch embeddings for ingestion (worker). Same model/dimension as query time (spec 2.4). */
export async function embeddings(texts: string[]) {
  const model = requiredEnv("OPENAI_EMBEDDING_MODEL");
  if (texts.length === 0 || texts.length > 256) throw new HttpError(400, "EMBEDDING_BATCH_SIZE");
  const raw = await providerPost("embeddings", { model, input: texts, dimensions: 1536 }, 60000);
  const parsed = z.object({
    data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number().finite()).length(1536) })),
    usage: z.object({ total_tokens: z.number().int().nonnegative() }).optional(),
  }).safeParse(raw);
  if (!parsed.success || parsed.data.data.length !== texts.length) throw new HttpError(502, "EMBEDDING_INVALID");
  const vectors = texts.map((_, i) => {
    const row = parsed.data.data.find((item) => item.index === i);
    if (!row || row.embedding.every((v) => v === 0)) throw new HttpError(502, "EMBEDDING_INVALID");
    return JSON.stringify(row.embedding);
  });
  return { model, vectors, usage: parsed.data.usage ?? null };
}
