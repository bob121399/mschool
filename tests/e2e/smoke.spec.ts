import { expect, test } from "@playwright/test";

test("health exposes only status and version", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const body = await r.json() as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["status", "version"]);
  const text = JSON.stringify(body);
  for (const secret of ["sb_secret", "SUPABASE", "OPENAI", "postgres"]) expect(text).not.toContain(secret);
});

test("security headers and CSP nonce on public pages", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/u);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
});

test("protected API without session → 401 JSON, cross-origin mutation → 403", async ({ request }) => {
  const r = await request.get("/api/me/roadmap?assignmentId=00000000-0000-4000-8000-000000000000");
  expect(r.status()).toBe(401);
  const post = await request.post("/api/support/tickets", { headers: { origin: "https://evil.example", "content-type": "application/json" },
    data: { subject: "x", body: "y" } });
  expect([401, 403]).toContain(post.status());
});
