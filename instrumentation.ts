// Startup config validator (spec 6 step 1.5). Runs once when the Node server boots.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateConfig } = await import("@/lib/config");
  const report = validateConfig();
  if (report.missing.length > 0 || report.invalid.length > 0) {
    // Names only, never values.
    console.error(JSON.stringify({ code: "CONFIG_INVALID", missing: report.missing, invalid: report.invalid }));
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error(`CONFIG_INVALID:${[...report.missing, ...report.invalid].join(",")}`);
    }
  }
  if (report.aiMissing.length > 0) {
    console.warn(JSON.stringify({ code: "AI_NOT_CONFIGURED", missing: report.aiMissing }));
  }
}
