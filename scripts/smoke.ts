// HTTP smoke against a running deployment (APP_ORIGIN). No credentials, no side effects.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const origin = process.env.SMOKE_ORIGIN ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
const checks: [string, number[]][] = [["/api/health", [200]], ["/", [200]], ["/login", [200]], ["/learn", [307]], ["/api/me/roadmap", [401]]];

async function main() {
  let failed = 0;
  for (const [path, ok] of checks) {
    const r = await fetch(`${origin}${path}`, { redirect: "manual" });
    const pass = ok.includes(r.status) && (path !== "/" || Boolean(r.headers.get("content-security-policy")));
    if (!pass) failed += 1;
    console.log(JSON.stringify({ path, status: r.status, pass }));
  }
  process.exit(failed ? 1 : 0);
}
void main();
