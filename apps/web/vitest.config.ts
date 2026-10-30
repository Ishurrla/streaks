import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure code, no emulators.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
