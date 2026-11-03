import { defineConfig } from "@playwright/test";

// Layout checks in a real browser, against the local app on the emulators. Start
// `pnpm dev` first, then run `pnpm test:layout`. Uses the installed Chrome; on a machine
// without it, run `pnpm --filter web exec playwright install chromium` and set
// PLAYWRIGHT_CHANNEL=chromium.
export default defineConfig({
  testDir: "./e2e",
  timeout: 600_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.LAYOUT_BASE_URL ?? "http://localhost:3000",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
    // Fail a step quickly instead of waiting out the whole test.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
});
