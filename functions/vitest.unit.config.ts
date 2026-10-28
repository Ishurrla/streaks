import { defineConfig } from "vitest/config";

// Pure unit tests: no emulators needed.
export default defineConfig({
  test: { include: ["test/unit/**/*.test.ts"] },
});
