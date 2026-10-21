import { createHash } from "node:crypto";
import { embeddings } from "@/lib/ai/openai";
import { chunkPages } from "@/lib/chunking";
import { detectMime, MAX_UPLOAD_BYTES } from "@/lib/files";
import { scanBytes } from "@/lib/scanner";
import { PermanentJobError, TransientJobError } from "../errors";
import { recordAgentRun, type JobContext, type JobOutcome } from "../context";
import { parseInChild } from "../parse";

// Pipeline (2.4): scan → isolated extraction → normalization → chunks → embeddings → review by HR.
export async function ingestion(ctx: JobContext): Promise<JobOutcome> {
  const started = Date.now();
  const documentId = String((ctx.job.payload as { document_id?: string }).document_id ?? "");
  const setStatus = async (status: "processing" | "failed" | "needs_review", code?: string) => {
    const r = await ctx.db.rpc("set_document_status", { p_job: ctx.job.id, p_lease: ctx.lease, p_document: documentId,
      p_status: status, p_error: code });
    if (r.error) throw new TransientJobError(r.error.message === "STALE_LEASE" ? "STALE_LEASE" : r.error.message);
  };
  const doc = await ctx.db.from("documents").select("id,tenant_id,object_path,sha256,mime_type,status")
    .eq("id", documentId).eq("tenant_id", ctx.job.tenant_id as string).single();
  if (doc.error || !doc.data) throw new PermanentJobError("NOT_FOUND");
  if (doc.data.sha256 !== (ctx.job.payload as { sha256?: string }).sha256) throw new PermanentJobError("HASH_MISMATCH");
  await setStatus("processing");
  const file = await ctx.db.storage.from("knowledge").download(doc.data.object_path);
  if (file.error || !file.data) throw new TransientJobError("STORAGE_UNAVAILABLE");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const fail = async (code: string, status: "failed" | "needs_review") => {
    await setStatus(status, code);
    throw new PermanentJobError(code, "failed");
  };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail("FILE_TOO_LARGE", "failed");
  if (createHash("sha256").update(bytes).digest("hex") !== doc.data.sha256) return fail("HASH_MISMATCH", "failed");
  if (detectMime(bytes) !== doc.data.mime_type) return fail("FILE_TYPE_MISMATCH", "failed");
  const scan = await scanBytes(bytes);
  if (scan.status === "unavailable") return fail("SCANNER_UNAVAILABLE", "needs_review");
  if (scan.status === "infected") return fail("MALWARE_FOUND", "failed");
  const parsed = await parseInChild(bytes, doc.data.mime_type);
  if ("error" in parsed) {
    const review = ["PDF_ENCRYPTED", "PDF_CORRUPTED", "LIMIT_PAGES", "LIMIT_CHARS"].includes(parsed.error);
    return fail(parsed.error, review ? "needs_review" : "failed");
  }
  const totalChars = parsed.pages.reduce((s, p) => s + p.text.trim().length, 0);
  if (totalChars < Math.max(50, parsed.pages.length * 20)) return fail("SCAN_TEXT_LAYER_MISSING", "needs_review");
  const chunks = chunkPages(parsed.pages);
  if (chunks.length === 0) return fail("SCAN_TEXT_LAYER_MISSING", "needs_review");
  const rows: { page: number; content: string; embedding: string; embedding_model: string }[] = [];
  let tokens = 0;
  for (let i = 0; i < chunks.length; i += 64) {
    const batch = chunks.slice(i, i + 64);
    const emb = await embeddings(batch.map((c) => c.content));
    tokens += emb.usage?.total_tokens ?? 0;
    batch.forEach((c, j) => rows.push({ page: c.page, content: c.content, embedding: emb.vectors[j]!, embedding_model: emb.model }));
    await ctx.db.rpc("heartbeat_job", { p_job: ctx.job.id, p_lease: ctx.lease });
  }
  const stored = await ctx.db.rpc("store_document_chunks", { p_job: ctx.job.id, p_lease: ctx.lease, p_document: documentId,
    p_chunks: rows, p_page_count: parsed.pages.length, p_char_count: totalChars });
  if (stored.error) throw new TransientJobError(stored.error.message);
  await recordAgentRun(ctx, "course_creator", { stage: "ingestion", document_id: documentId, chunks: rows.length,
    embedding_usage: { total_tokens: tokens } }, started);
  return { status: "succeeded", result: { document_id: documentId, chunks: rows.length, pages: parsed.pages.length } };
}
