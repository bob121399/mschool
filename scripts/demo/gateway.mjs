// LOCAL DEMO gateway: serves the app and the local Supabase API from ONE port, so the demo works
// behind a preview proxy (or a tunnel) that exposes a single port. Used with same-origin mode
// (NEXT_PUBLIC_SUPABASE_URL="/", see lib/supabase/url.ts). Not for production.
//   GATEWAY_PORT (3100) → Supabase API paths to SUPABASE_INTERNAL_URL, everything else to APP_URL.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 3100);
const APP = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
const SUPABASE = new URL(process.env.SUPABASE_INTERNAL_URL ?? "http://127.0.0.1:54321");
// The origin the app is configured with (APP_ORIGIN); the gateway presents every request as coming to it.
const APP_ORIGIN = new URL(process.env.APP_ORIGIN ?? `http://localhost:${PORT}`);
const SUPABASE_PATHS = /^\/(auth|rest|storage|realtime|functions|graphql)\/v1(\/|$)/u;
let logged = 0;

function publicHost(req) {
  return String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
}

const server = http.createServer((req, res) => {
  const toSupabase = SUPABASE_PATHS.test(req.url ?? "");
  const target = toSupabase ? SUPABASE : APP;
  const headers = { ...req.headers, host: toSupabase ? target.host : APP_ORIGIN.host };
  // Same-origin check translation: a browser request whose Origin matches the host it was sent to
  // is presented to the app with APP_ORIGIN. Any other Origin passes through and is rejected by the app.
  const origin = req.headers.origin;
  if (origin && !toSupabase) {
    try { if (new URL(origin).host === publicHost(req)) headers.origin = APP_ORIGIN.origin; } catch { /* keep as is */ }
  }
  if (logged < 40) {
    logged += 1;
    console.log(JSON.stringify({ m: req.method, url: req.url, host: req.headers.host, xfh: req.headers["x-forwarded-host"],
      xfp: req.headers["x-forwarded-proto"], origin, to: toSupabase ? "supabase" : "app" }));
  }
  const upstream = http.request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers }, (up) => {
    const out = { ...up.headers };
    // Absolute redirects from the app point at APP_ORIGIN; make them relative to whatever host the browser used.
    const loc = out.location;
    if (typeof loc === "string" && loc.startsWith(APP_ORIGIN.origin)) out.location = loc.slice(APP_ORIGIN.origin.length) || "/";
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("gateway: upstream unavailable"); });
  req.pipe(upstream);
});

server.listen(PORT, "0.0.0.0", () => console.log(`gateway on :${PORT} → app ${APP.origin}, supabase ${SUPABASE.origin}`));
