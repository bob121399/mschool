// Step 4.5: the production browser bundle must not contain server secrets.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const roots = [".next/static"];
// Env names and real secret values. The bare prefix "sb_secret_" is NOT a needle: supabase-js ships
// it as a literal to detect key types; key-shaped strings are caught by KEY_SHAPED below.
const needles = ["SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "service_role"];
const KEY_SHAPED = /\bsb_secret_[A-Za-z0-9_-]{16,}|\bsk-(?:proj-)?[A-Za-z0-9]{20,}/u;
for (const k of ["SUPABASE_SECRET_KEY", "OPENAI_API_KEY"]) {
  const v = process.env[k]?.trim();
  if (v && v.length > 8) needles.push(v);
}
const hits: string[] = [];
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map|txt)$/u.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const n of needles) if (text.includes(n)) hits.push(`${p}: ${n.length > 30 ? "<secret value>" : n}`);
      if (KEY_SHAPED.test(text)) hits.push(`${p}: <key-shaped string>`);
    }
  }
}
for (const r of roots) {
  if (!existsSync(r)) {
    console.error(`missing ${r}: run npm run build first`);
    process.exit(2);
  }
  walk(r);
}
if (hits.length) {
  console.error(JSON.stringify({ status: "FAILED", hits }));
  process.exit(1);
}
console.log(JSON.stringify({ status: "OK", scanned: roots, checked_patterns: needles.length }));
