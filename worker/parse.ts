import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export type ParseResult = { pages: { page: number; text: string }[] } | { error: string };

const CHILD = fileURLToPath(new URL("./parse-child.ts", import.meta.url));

/** Spawns the parser with a 512 MB heap, 90 s timeout, and an environment without secrets. */
export function parseInChild(bytes: Uint8Array, mime: string, timeoutMs = 90_000): Promise<ParseResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--max-old-space-size=512", "--import", "tsx", CHILD, mime], {
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ error: "PARSE_TIMEOUT" }); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString("utf8");
      if (output.length > 40_000_000) { child.kill("SIGKILL"); clearTimeout(timer); resolve({ error: "LIMIT_CHARS" }); }
    });
    child.on("error", () => { clearTimeout(timer); resolve({ error: "PARSE_FAILED" }); });
    child.on("close", () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(output) as ParseResult); } catch { resolve({ error: "PARSE_FAILED" }); }
    });
    child.stdin.end(Buffer.from(bytes));
  });
}
