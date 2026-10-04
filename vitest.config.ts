import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // The game rules are pure, so they run in plain Node (CODING_STANDARDS.md).
      { test: { name: "rules", include: ["test/rules/**/*.test.ts"] } },
      // Drawing Roscos from a Word List, and the Clue checks: pure, so Node too.
      { test: { name: "clues", include: ["test/clues/**/*.test.ts"] } },
      // The Word List's definition filter, and checks on the committed file.
      { test: { name: "word-list", include: ["test/word-list/**/*.test.ts"] } },
      // The client's pure helpers, like the Mirror's geometry.
      { test: { name: "client", include: ["test/client/**/*.test.ts"] } },
      {
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } }),
        ],
        test: { name: "workers", include: ["test/workers/**/*.test.ts"] },
      },
    ],
  },
});
