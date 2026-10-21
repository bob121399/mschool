import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/redirect";
import { validateConfig } from "@/lib/config";

describe("safeNext (open redirect protection, spec 5.3)", () => {
  it.each([
    ["/learn", "/learn"], ["/hr/courses?x=1", "/hr/courses?x=1"], ["//evil.com", "/login"], ["/\\evil.com", "/login"],
    ["https://evil.com/x", "/login"], ["javascript:alert(1)", "/login"], ["/%2F%2Fevil.com", "/login"], ["", "/login"],
    ["/ok\nset-cookie", "/login"], ["http://localhost:3000/invite/accept?token=ab", "/invite/accept?token=ab"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input, "/login", "http://localhost:3000")).toBe(expected);
  });
});

describe("startup config validator", () => {
  it("reports missing names only and invalid URLs", () => {
    const r = validateConfig({ NODE_ENV: "test", APP_ORIGIN: "not a url", NEXT_PUBLIC_SUPABASE_URL: "http://x" } as NodeJS.ProcessEnv);
    expect(r.missing).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]);
    expect(r.invalid).toEqual(["APP_ORIGIN"]);
    expect(r.aiMissing).toContain("OPENAI_API_KEY");
  });
});
