// Writes/updates .env.local for the LOCAL demo from `supabase status -o env` (stdin).
// Only the three Supabase values and APP_ORIGIN are touched; OPENAI_* and other values are preserved.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const status = Object.fromEntries(
  readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/u))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2]]),
);
const values: Record<string, string | undefined> = {
  APP_ORIGIN: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};
for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`supabase status did not return a value for ${name}; is the local stack running?`);
}
const url = new URL(values.NEXT_PUBLIC_SUPABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Refusing: demo env must point to a local Supabase");

const file = existsSync(".env.local") ? ".env.local" : ".env.example";
const lines = readFileSync(file, "utf8").split("\n");
for (const [name, value] of Object.entries(values)) {
  const idx = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (idx >= 0) lines[idx] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
}
writeFileSync(".env.local", lines.join("\n"), { mode: 0o600 });

const env = Object.fromEntries(lines.map((l) => l.split(/=(.*)/su)).filter((p) => p.length > 1).map((p) => [p[0], p[1]?.trim()]));
const ai = ["OPENAI_API_KEY", "OPENAI_TUTOR_MODEL", "OPENAI_ASSESSOR_MODEL", "OPENAI_EMBEDDING_MODEL", "OPENAI_WORKER_MODEL"];
const missing = ai.filter((n) => !env[n]);
console.log(`.env.local ${file === ".env.local" ? "updated" : "created"}; AI ${missing.length ? `NOT configured (missing: ${missing.join(", ")})` : "configured"}`);
