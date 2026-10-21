import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requiredEnv } from "@/lib/config";

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
}

// ERRATA E-TS-14: NextResponse.json cannot carry a 204; contract routes (reading-complete) need it.
export function noContent() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}

export function requireOrigin(request: Request): void {
  const expected = new URL(requiredEnv("APP_ORIGIN")).origin;
  if (request.headers.get("origin") !== expected) throw new HttpError(403, "ORIGIN_REJECTED");
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "ORIGIN_REJECTED");
  }
}

export async function readJson(request: Request, maxBytes = 65536): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSON_REQUIRED");
  }
  if (!request.body) throw new HttpError(400, "BODY_REQUIRED");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON");
  } finally {
    reader.releaseLock();
  }
}

const KNOWN: Record<string, number> = {
  RATE_LIMIT: 429, ATTEMPT_LIMIT: 429, IN_PROGRESS: 409,
  IDEMPOTENCY_CONFLICT: 409, RETRY_EXHAUSTED: 409,
  STALE_LEASE: 409, ASSIGNMENT_INACTIVE: 409,
  ASSESSMENT_NOT_AVAILABLE: 409, NOT_FOUND: 404, FORBIDDEN: 403,
  REVISION_CONFLICT: 409, UNAUTHENTICATED: 401, TENANT_INACTIVE: 403,
};

// Business errors raised by our SQL are UPPER_SNAKE codes with known SQLSTATEs. Only those are
// surfaced; native PostgreSQL messages (which may echo values) are never forwarded.
const BUSINESS_STATE: Record<string, number> = {
  "23514": 409, // check / state rule (PUBLISHED_IMMUTABLE, MISSING_RUBRIC, ...)
  "22023": 400, // invalid parameter (INVALID_EMAIL, REASON_REQUIRED, ...)
  "23505": 409, // uniqueness (USER_EXISTS, ROLE_CONFLICT)
  "40001": 409, // REVISION_CONFLICT
  P0001: 409,
};
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

// ERRATA E-TS-02: the listing mapped every unknown error (including business rule violations such
// as ACTIVE_ASSIGNMENT_EXISTS or MISSING_RUBRIC) to 503 DATABASE_UNAVAILABLE.
export function databaseError(error: { message: string; code?: string }): never {
  if (Object.hasOwn(KNOWN, error.message)) {
    throw new HttpError(KNOWN[error.message]!, error.message);
  }
  if (error.code === "PGRST116") throw new HttpError(404, "NOT_FOUND");
  if (error.code && Object.hasOwn(BUSINESS_STATE, error.code) && CODE_PATTERN.test(error.message)) {
    throw new HttpError(BUSINESS_STATE[error.code]!, error.message);
  }
  if (error.code === "42501") throw new HttpError(403, "FORBIDDEN");
  if (error.code === "23503" || error.code === "23514") throw new HttpError(409, "CONSTRAINT_VIOLATION");
  if (error.code === "22P02" || error.code === "22023") throw new HttpError(400, "INVALID_REQUEST");
  if (error.code === "23505") throw new HttpError(409, "DUPLICATE");
  throw new HttpError(503, "DATABASE_UNAVAILABLE");
}

export function publicError(error: unknown, traceId: string) {
  const e = error instanceof HttpError ? error
    : error instanceof z.ZodError ? new HttpError(400, "INVALID_REQUEST")
    : error instanceof Error && error.message.startsWith("CONFIG_MISSING:") ? new HttpError(503, "NOT_CONFIGURED")
    : new HttpError(500, "INTERNAL_ERROR");
  // No request body, raw provider error, email or secret in logs.
  console.error(JSON.stringify({ trace_id: traceId, code: e.code, status: e.status }));
  return json({ error: { code: e.code, trace_id: traceId } }, e.status,
    e.status === 429 ? { "Retry-After": "60" } : {});
}
