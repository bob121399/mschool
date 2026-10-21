import "server-only";
import { randomUUID } from "node:crypto";
import { publicError, requireOrigin } from "@/lib/http";

/** Uniform route wrapper: trace id, Origin check for mutations, error envelope (spec 5.4/5.5). */
export function route(
  fn: (request: Request, traceId: string) => Promise<Response>,
  options: { mutation: boolean },
) {
  return async (request: Request): Promise<Response> => {
    const traceId = randomUUID();
    try {
      if (options.mutation) requireOrigin(request);
      return await fn(request, traceId);
    } catch (error) {
      return publicError(error, traceId);
    }
  };
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
