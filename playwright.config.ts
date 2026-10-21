import { defineConfig, devices } from "@playwright/test";

// Final smoke runs against the production build, spec 6 step 6.7. With `output: "standalone"` the
// supported runner is the standalone server (same as the Docker `web` image), not `next start`.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure",
    // Pre-installed browser in the cloud sandbox; CI uses `npx playwright install`.
    launchOptions: process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: "bash scripts/start-standalone.sh",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
