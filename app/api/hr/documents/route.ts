import { z } from "zod";
import { randomUUID } from "node:crypto";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { databaseError, json, readJson } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/files";

export const dynamic = "force-dynamic";
const body = z.object({
  title: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(255),
  mime: z.enum(["application/pdf", "text/plain"]),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict();

// Metadata first, then the browser uploads the bytes (no upsert) to the returned private path.
// The original file name is stored as text and never used to build the path (spec 2.4).
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 4096));
  const { db, tenantId, userId } = await hrContext();
  const id = randomUUID();
  const ext = input.mime === "application/pdf" ? "pdf" : "txt";
  const objectPath = `${tenantId}/${id}/${randomUUID()}.${ext}`;
  const { error } = await db.from("documents").insert({ id, tenant_id: tenantId, title: input.title, object_path: objectPath,
    sha256: input.sha256, original_filename: input.filename, mime_type: input.mime, size_bytes: input.size, uploaded_by: userId });
  if (error) databaseError(error);
  return json({ documentId: id, bucket: "knowledge", uploadPath: objectPath }, 201);
}, { mutation: true });
