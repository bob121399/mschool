import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { hrContext } from "@/lib/auth/context";
import { HttpError, databaseError, json, publicError, requireOrigin } from "@/lib/http";
import { detectMime, MAX_UPLOAD_BYTES } from "@/lib/files";
import { scannerConfigured } from "@/lib/scanner";

export const dynamic = "force-dynamic";

// Verifies the uploaded object (presence, size, hash, magic bytes) under the HR's own Storage
// policy, then enqueues a durable ingestion job (202). Malware scanning happens in the worker;
// without a configured scanner processing is blocked with an explicit stage.
export async function POST(request: Request, ctx: RouteContext<"/api/hr/documents/[id]/process">) {
  const traceId = randomUUID();
  try {
    requireOrigin(request);
    const id = z.uuid().parse((await ctx.params).id);
    const { db } = await hrContext();
    const doc = await db.from("documents").select("id,object_path,sha256,mime_type,size_bytes,status").eq("id", id).maybeSingle();
    if (doc.error) databaseError(doc.error);
    if (!doc.data) throw new HttpError(404, "NOT_FOUND");
    const fail = async (code: string, status: number) => {
      await db.from("documents").update({ status: "failed", error_code: code }).eq("id", id).neq("status", "approved");
      throw new HttpError(status, code);
    };
    const file = await db.storage.from("knowledge").download(doc.data.object_path);
    if (file.error || !file.data) return await fail("FILE_MISSING", 409);
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return await fail("FILE_TOO_LARGE", 413);
    if (createHash("sha256").update(bytes).digest("hex") !== doc.data.sha256) return await fail("HASH_MISMATCH", 409);
    if (detectMime(bytes) !== doc.data.mime_type) return await fail("FILE_TYPE_MISMATCH", 415);
    if (!scannerConfigured()) {
      await db.from("documents").update({ error_code: "SCANNER_UNAVAILABLE" }).eq("id", id);
      throw new HttpError(503, "SCANNER_UNAVAILABLE");
    }
    const job = await db.rpc("request_document_processing", { p_document: id });
    if (job.error) databaseError(job.error);
    return json({ jobId: job.data }, 202);
  } catch (error) {
    return publicError(error, traceId);
  }
}
