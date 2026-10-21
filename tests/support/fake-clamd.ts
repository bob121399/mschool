// TEST-ONLY clamd speaking the INSTREAM protocol. Used to exercise the ingestion pipeline in tests;
// production never treats a file as clean without a real scanner (lib/scanner.ts).
import { createServer, type Server } from "node:net";

export async function startFakeClamd(verdict: () => "OK" | "FOUND"): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length >= 4 && buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) {
        socket.end(verdict() === "OK" ? "stream: OK\0" : "stream: Eicar-Test-Signature FOUND\0");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return { port, close: () => new Promise<void>((r) => server.close(() => r())) };
}
