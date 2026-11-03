import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit and component tests, no emulators. Component tests opt into jsdom per file.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
