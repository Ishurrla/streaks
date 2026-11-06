import { expect, test, type Locator, type Page } from "@playwright/test";

// No screen may scroll sideways, at any of these widths, in either theme. Runs against
// the local app on the emulators (see playwright.config.ts): it signs up a throwaway
// user and deletes it again at the end.

const WIDTHS = [360, 390, 768, 900, 1280];
const THEMES = ["light", "dark"] as const;

// The longest unbroken name and habit names the app accepts: the likeliest to overflow.
const LONG_NAME = "Maximilianalexandrawolfeschlegelsteinhausenberger".slice(0, 50);
const LONG_HABITS = ["Supercalifragilisticexpialidociouspractice".slice(0, 40), "Go for a walk"];
const PASSWORD = "layout-test-password";

test.beforeEach(({ baseURL }) => {
  // Signing up and deleting accounts belongs on the emulators, never a real project.
  const host = new URL(baseURL!).hostname;
  test.skip(!["localhost", "127.0.0.1"].includes(host), "only runs against the local app");
});

// Set once the throwaway user exists, so afterEach can delete it even after a failure.
let signedUpWith: string | null = null;

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: testInfo.outputPath("before-clean-up.png"), fullPage: true });
  }
  if (!signedUpWith) return;
  signedUpWith = null;
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.fill("#delete-password", PASSWORD);
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL((url) => url.pathname === "/", { waitUntil: "commit" });
});

/** Toggles a habit card from the keyboard: at phone sizes the tab bar or a toast can cover it. */
async function checkOff(card: Locator) {
  await card.focus();
  await card.press("Enter");
}

async function expectNoSideScroll(page: Page, label: string, widths = WIDTHS, settleMs = 150) {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 900 ? 800 : 860 });
      if (settleMs) await page.waitForTimeout(settleMs);
      const { scrollWidth, viewport, culprits } = await page.evaluate(() => {
        const vw = window.innerWidth;
        // The outermost elements that reach past the right edge, to say what to fix.
        const past = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1);
        const outermost = past.filter((el) => !past.includes(el.parentElement!));
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewport: vw,
          culprits: outermost
            .slice(0, 4)
            .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}"> to ${Math.round(el.getBoundingClientRect().right)}px`),
        };
      });
      expect(scrollWidth, `${label} at ${width}px, ${theme}: ${scrollWidth}px wide; ${culprits.join(", ")}`).toBeLessThanOrEqual(viewport);
    }
  }
}

test("public pages never scroll sideways", async ({ page }) => {
  for (const path of ["/", "/signup", "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page, path);
  }
});

test("app screens never scroll sideways", async ({ page }) => {
  const email = `layout.${Date.now()}@example.com`;
  await page.goto("/signup");
  // Typing before the page hydrates would be lost.
  await page.waitForLoadState("networkidle");
  await page.fill("#name", LONG_NAME);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/today", { waitUntil: "commit" });
  signedUpWith = email;

  await page.getByText("What do you want to do every day?").waitFor();
  await expectNoSideScroll(page, "Today, empty");

  // Add the habits from Habits, checking the sheet while it is open.
  await page.goto("/habits");
  for (const [i, name] of LONG_HABITS.entries()) {
    await page.getByRole("button", { name: "Add habit" }).first().click();
    await page.locator("#habit-name").fill(name);
    if (i === 0) await expectNoSideScroll(page, "Add habit sheet");
    await page.locator("dialog[open]").getByRole("button", { name: "Add habit" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => undefined);
    // Right after a sheet closes, clicks are briefly swallowed (see Sheet).
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-click-shield"));
    await expect(page.getByText(name)).toBeVisible();
  }
  await expectNoSideScroll(page, "Habits");

  await page.goto("/today");
  await page.locator(".habit-card").first().waitFor();
  await expectNoSideScroll(page, "Today");
  // Not scrolling sideways is not enough: the cards must keep room for the habit name.
  for (const width of [...WIDTHS, 1000, 1100, 1179, 1180]) {
    await page.setViewportSize({ width, height: 860 });
    const { width: nameWidth } = (await page.locator(".habit-card .name").first().boundingBox())!;
    expect(nameWidth, `habit name at ${width}px`).toBeGreaterThanOrEqual(170);
  }

  await page.goto("/progress");
  await page.getByText("Current streak").waitFor();
  await expectNoSideScroll(page, "Progress");

  await page.goto("/settings");
  await page.getByRole("heading", { name: "Sign-in methods" }).waitFor();
  await expectNoSideScroll(page, "Settings");

  // Check everything off for the all-done celebration.
  await page.goto("/today");
  const cards = page.locator(".habit-card");
  await expect(cards).toHaveCount(LONG_HABITS.length);
  const total = LONG_HABITS.length;
  for (let i = 0; i < total; i++) {
    await checkOff(page.locator(".habit-card:not(.done)").first());
    await expect(page.locator(".habit-card.done")).toHaveCount(i + 1);
  }
  // A quick sweep with short pauses; it must still be open at the end for the check to count.
  const celebration = page.locator("dialog.celeb[open]");
  await celebration.waitFor();
  await expectNoSideScroll(page, "All-done celebration", WIDTHS, 100);
  await expect(celebration, "the celebration closed before every width was checked").toBeVisible({ timeout: 0 });
  await page.keyboard.press("Escape");
});
