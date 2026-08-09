import { defineConfig } from "vitest/config";

/**
 * Worker tests only. The Next.js app has its own config in web/ — the two are
 * separate projects because they deploy differently (wrangler vs a static
 * build) and need different environments.
 */
export default defineConfig({
  test: {
    include: ["worker/src/**/*.test.ts"],
  },
});
