import { expect, test, type Page } from "@playwright/test";

// The all-done celebration and the habit sheet are modal: nothing underneath them can be
// clicked, tapped, tabbed to or scrolled while they are open, and the click that closes
// them must not reach the page either. Runs against the local app on the emulators (see
// playwright.config.ts), with a throwaway user deleted at the end.

const PASSWORD = "overlay-test-password";

test.beforeEach(({ baseURL }) => {
  // Signing up and deleting accounts belongs on the emulators, never a real project.
  const host = new URL(baseURL!).hostname;
  test.skip(!["localhost", "127.0.0.1"].includes(host), "only runs against the local app");
});

let signedUp = false;

test.afterEach(async ({ page }) => {
  if (!signedUp) return;
  signedUp = false;
  await page.keyboard.press("Escape");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.fill("#delete-password", PASSWORD);
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForURL((url) => url.pathname === "/", { waitUntil: "commit" });
});

const states = (page: Page) =>
  page.locator(".habit-card").evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-pressed")));

/** A point on the first habit card that the overlay's backdrop covers (beside the dialog box). */
const cardPoint = (page: Page) =>
  page.locator(".habit-card").first().evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + r.height / 2 };
  });

async function checkEverythingOff(page: Page) {
  const total = await page.locator(".habit-card").count();
  for (let left = await page.locator(".habit-card:not(.done)").count(); left > 0; left--) {
    await page.locator(".habit-card:not(.done)").first().click();
    await expect(page.locator(".habit-card.done")).toHaveCount(total - left + 1);
  }
  const dialog = page.locator("dialog.celeb[open]");
  await dialog.waitFor();
  return dialog;
}

async function expectModal(page: Page, dialog: ReturnType<Page["locator"]>) {
  // A dialog to assistive technology (the <dialog> element's own role), modal, and named.
  await expect(dialog).toHaveRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName(/.+/);
  // The rest of the app is inert, and focus is inside the dialog.
  expect(await page.locator(".habit-card").first().evaluate((c) => !!c.closest("[inert]"))).toBe(true);
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // Tab never reaches a habit card.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".habit-card"))).toBe(false);
  }
}

test("the all-done celebration and the habit sheet block the page behind them", async ({ page }) => {
  // Wide enough that the cards sit beside the dialog box, under the bare backdrop, and short
  // enough that the page can scroll.
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.fill("#name", "Overlay");
  await page.fill("#email", `overlay.${Date.now()}@example.com`);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/today", { waitUntil: "commit" });
  signedUp = true;
  await page.getByText("What do you want to do every day?").waitFor();
  await page.getByRole("button", { name: "+ Go for a walk" }).click();
  await page.locator(".habit-card").first().waitFor();
  await page.getByRole("button", { name: "+ Add a habit" }).click();
  await page.locator("#habit-name").fill("Read");
  await page.locator("dialog[open]").getByRole("button", { name: "Add habit" }).click();
  await expect(page.locator(".habit-card")).toHaveCount(2);

  // 1. Celebration: modal, inert page, no Tab to cards, no scrolling behind it.
  let dialog = await checkEverythingOff(page);
  // The dialog focuses its first button on opening.
  await expect(dialog.getByRole("button", { name: "Nice" })).toBeFocused();
  const done = await states(page);
  expect(done).toEqual(["true", "true"]);
  await expectModal(page, dialog);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.move(195, 40);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(y);

  // A double-click on the backdrop over a card: the first click closes it, and neither
  // click may reach the card underneath.
  let point = await cardPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await states(page)).toEqual(done);

  // Unlocked again: no longer inert, and the page scrolls.
  expect(await page.locator(".habit-card").first().evaluate((c) => !!c.closest("[inert]"))).toBe(false);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // 2. Set off from the keyboard: it stays until dismissed (it used to vanish after 5
  // seconds, under a tap meant for it), Escape closes it, and focus goes back to the card.
  await page.locator(".habit-card").first().click();
  await expect(page.locator(".habit-card.done")).toHaveCount(1);
  // One request at a time per habit: let that one finish first.
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.locator(".habit-card").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".habit-card.done")).toHaveCount(2);
  dialog = page.locator("dialog.celeb[open]");
  await dialog.waitFor();
  await page.waitForTimeout(5500);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.locator(".habit-card").first().evaluate((c) => c === document.activeElement)).toBe(true);
  expect(await states(page)).toEqual(done);

  // 3. The habit sheet behaves the same way. (Right after closing, clicks are briefly swallowed.)
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-click-shield"));
  await page.getByRole("button", { name: "Change days for Go for a walk" }).click();
  const sheet = page.locator("dialog[open]");
  await sheet.waitFor();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  expect(await page.locator(".habit-card").first().evaluate((c) => !!c.closest("[inert]"))).toBe(true);
  point = await cardPoint(page);
  await page.mouse.dblclick(point.x, point.y);
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await states(page)).toEqual(done);
  expect(await page.locator(".habit-card").first().evaluate((c) => !!c.closest("[inert]"))).toBe(false);
});
