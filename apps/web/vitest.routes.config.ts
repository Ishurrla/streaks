import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Route handler tests: each test calls a route's POST handler in-process with a real
// ID token from the Auth emulator. Run through `pnpm test`, which starts the emulators.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside React's server environment.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/routes/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
