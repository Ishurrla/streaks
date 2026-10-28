import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    // All integration tests share one emulator instance, so run files one at a time.
    fileParallelism: false,
    env: { GCLOUD_PROJECT: "demo-streaks" },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
