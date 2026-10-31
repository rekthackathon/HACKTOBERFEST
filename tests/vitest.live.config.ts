/**
 * TEMPORARY manual live-test configuration — not committed, not part of npm run check.
 *
 * The root vitest config includes only the normal "tests" plus dot-test patterns (tests with the regular
 * .test.ts suffix); this config adds live files so they can be invoked on demand:
 *
 *   RUN_LIVE=1 npx vitest run --config tests/vitest.live.config.ts
 *
 * The "server-only" alias is an import shim for plain Node (the real provider
 * and all implementation modules still run for real).
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: fileURLToPath(new URL("./live-stubs/server-only.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
    ],
  },
  test: {
    root: fileURLToPath(new URL("..", import.meta.url)),
    environment: "node",
    include: ["tests/*.live.ts"],
    testTimeout: 240_000,
  },
});
