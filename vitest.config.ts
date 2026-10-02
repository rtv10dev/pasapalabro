import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // The game rules are pure, so they run in plain Node (CODING_STANDARDS.md).
      { test: { name: "rules", include: ["test/rules/**/*.test.ts"] } },
      // Clue generation gets its providers passed in, so it runs in Node too.
      { test: { name: "clues", include: ["test/clues/**/*.test.ts"] } },
      // The client's pure helpers, like the Mirror's geometry.
      { test: { name: "client", include: ["test/client/**/*.test.ts"] } },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // Never reach the real Workers AI from a test.
            remoteBindings: false,
            // The tests fake Gemini's API, so any key will do.
            miniflare: { bindings: { GEMINI_API_KEY: "test-key" } },
          }),
        ],
        test: { name: "workers", include: ["test/workers/**/*.test.ts"] },
      },
    ],
  },
});
