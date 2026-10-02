import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // The game rules are pure, so they run in plain Node (CODING_STANDARDS.md).
      { test: { name: "rules", include: ["test/rules/**/*.test.ts"] } },
      {
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } }),
        ],
        test: { name: "workers", include: ["test/workers/**/*.test.ts"] },
      },
    ],
  },
});
