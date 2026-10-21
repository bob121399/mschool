import { Socket } from "node:net";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "unavailable" };

export function scannerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CLAMAV_HOST?.trim());
}

/** clamd INSTREAM protocol. Without a configured scanner the result is "unavailable" — the file is
 * never treated as clean (spec 2.4 / step 5.2). */
export async function scanBytes(bytes: Uint8Array, env: NodeJS.ProcessEnv = process.env, timeoutMs = 30_000): Promise<ScanResult> {
  const host = env.CLAMAV_HOST?.trim();
  if (!host) return { status: "unavailable" };
  const port = Number(env.CLAMAV_PORT ?? 3310);
  return new Promise<ScanResult>((resolve) => {
    const socket = new Socket();
    let reply = "";
    const done = (r: ScanResult) => { socket.destroy(); resolve(r); };
    socket.setTimeout(timeoutMs, () => done({ status: "unavailable" }));
    socket.on("error", () => done({ status: "unavailable" }));
    socket.on("data", (d) => { reply += d.toString("utf8"); });
    socket.on("end", () => {
      const text = reply.replace(/\0/gu, "").trim();
      if (/:\s*OK$/u.test(text)) return done({ status: "clean" });
      const m = /:\s*(.+)\s+FOUND$/u.exec(text);
      if (m) return done({ status: "infected", signature: m[1]!.slice(0, 120) });
      return done({ status: "unavailable" });
    });
    socket.connect(port, host, () => {
      socket.write("zINSTREAM\0");
      const chunk = 64 * 1024;
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.subarray(i, Math.min(bytes.length, i + chunk));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
