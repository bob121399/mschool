// Public health: build version and status only — no ENV names/values or DB details (spec 5.4).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", version: process.env.APP_VERSION ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
