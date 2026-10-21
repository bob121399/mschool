/** Data problem that retrying cannot fix → needs_review or failed without retry. */
export class PermanentJobError extends Error {
  constructor(public code: string, public status: "needs_review" | "failed" = "failed") {
    super(code);
  }
}
/** Provider/DB outage → retry with exponential backoff + jitter. */
export class TransientJobError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
