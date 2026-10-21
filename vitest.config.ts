import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const alias = {
  "@": root,
  "server-only": fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration", include: ["tests/integration/**/*.test.ts"], environment: "node",
          // Real local Supabase; tests share fixtures, so run files sequentially.
          fileParallelism: false, testTimeout: 60000, hookTimeout: 120000,
          setupFiles: ["tests/support/load-env.ts"],
        },
      },
      {
        resolve: { alias },
        test: { name: "evals", include: ["tests/evals/**/*.test.ts"], environment: "node", testTimeout: 120000,
          setupFiles: ["tests/support/load-env.ts"] },
      },
    ],
  },
});
