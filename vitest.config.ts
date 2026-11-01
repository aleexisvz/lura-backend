import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Integration tests run against a remote database (Neon), where a single
    // query can take several seconds. The 5 s default causes false failures.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
