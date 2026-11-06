import { expect, test, type Page } from "@playwright/test";

// GitHub sign-up, sign-in, the existing-email case, connect, disconnect and deleting a
// GitHub-only account, through the Auth emulator's own GitHub window. (That window insists
// on an email, so a GitHub account without one is covered in src/lib/auth.test.tsx.) Runs only on the TEST
// emulators: `pnpm test:github` starts them, builds the app against them and runs this.

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const PROJECT = process.env.GCLOUD_PROJECT ?? "";

test.beforeEach(({ baseURL }) => {
  const host = new URL(baseURL!).hostname;
  test.skip(
    !["localhost", "127.0.0.1"].includes(host) || !AUTH_EMULATOR || AUTH_EMULATOR.endsWith(":9099") || !PROJECT.startsWith("demo-"),
    "runs only against the test emulators: pnpm test:github",
  );
});

const run = Date.now();
const GRACE = { email: `grace.${run}@example.com`, name: "Grace Hopper" };
const PAT = { email: `pat.${run}@example.com`, password: "pat-password-123" };
const PAT_GITHUB = `pat.work.${run}@example.com`;

interface GitHubAccount {
  email?: string;
  name?: string;
  /** Already in the emulator: pick it from the list instead of adding it. */
  existing?: boolean;
}

/** Opens the GitHub window with `open`, and signs in there as `account`. */
async function inGitHubWindow(page: Page, open: () => Promise<unknown>, account: GitHubAccount) {
  const [popup] = await Promise.all([page.waitForEvent("popup"), open()]);
  await popup.waitForLoadState();
  await expect(popup.getByText("Sign-in with Github.com")).toBeVisible();
  if (account.existing) {
    await popup.getByText(account.email!).first().click();
  } else {
    await popup.getByText("Add new account").click();
    if (account.email) await popup.locator("#email-input").fill(account.email);
    if (account.name) await popup.locator("#display-name-input").fill(account.name);
    await popup.getByRole("button", { name: /Sign in with Github\.com/i }).click();
  }
  await popup.waitForEvent("close").catch(() => undefined);
}

/** Accounts in the test Auth emulator, read with its owner credentials. */
async function emulatorAccounts(): Promise<{ email?: string; displayName?: string }[]> {
  const res = await fetch(`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=500`, {
    headers: { authorization: "Bearer owner" },
  });
  return ((await res.json()) as { users?: { email?: string; displayName?: string }[] }).users ?? [];
}

const githubButton = (page: Page, mode: "up" | "in") => page.getByRole("button", { name: `Sign ${mode} with GitHub` });

async function logOut(page: Page) {
  await page.goto("/habits");
  await page.getByRole("button", { name: /^Log out/ }).click();
  await page.waitForURL((u) => ["/", "/login"].includes(u.pathname), { waitUntil: "commit" });
}

test.describe.configure({ mode: "serial" });

test("closing the GitHub window says sign-in was cancelled", async ({ page }) => {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  const [popup] = await Promise.all([page.waitForEvent("popup"), githubButton(page, "up").click()]);
  await popup.waitForLoadState();
  await popup.close();
  await expect(page.getByRole("status").filter({ hasText: "Sign-in cancelled" })).toBeVisible({ timeout: 20_000 });
});

test("new user: signs up with GitHub, named from GitHub, and GitHub is the only way in", async ({ page }) => {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("We only use Google or GitHub to confirm who you are. We never post anything and never see your code.")).toBeVisible();
  await inGitHubWindow(page, () => githubButton(page, "up").click(), GRACE);
  await expect(page.getByRole("heading", { name: "Welcome, Grace" })).toBeVisible();
  await page.waitForURL("**/today");

  await page.goto("/settings");
  await page.getByRole("heading", { name: "Sign-in methods" }).waitFor();
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Sign-in methods" }) });
  await expect(section).toContainText(GRACE.email);
  await expect(section).toContainText("Your only way in. Add another method first.");
  await expect(page.getByRole("button", { name: "Disconnect GitHub" })).toBeDisabled();
  await expect(section).toContainText("GitHub will ask you to confirm it is you first.");
});

test("returning user: signs in with the same GitHub account", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await inGitHubWindow(page, () => githubButton(page, "in").click(), { ...GRACE, existing: true });
  await expect(page.getByRole("heading", { name: "Welcome back, Grace" })).toBeVisible();
  await page.waitForURL("**/today");
});

test("delete: a GitHub-only account confirms with GitHub, then is gone", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await inGitHubWindow(page, () => githubButton(page, "in").click(), { ...GRACE, existing: true });
  await page.waitForURL("**/today");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("GitHub will ask you to confirm it is you.")).toBeVisible();
  await inGitHubWindow(page, () => page.getByRole("button", { name: "Delete everything" }).click(), { ...GRACE, existing: true });
  await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
  await expect.poll(async () => (await emulatorAccounts()).some((u) => u.email === GRACE.email)).toBe(false);
});

test("an email that already has a password account is not merged, and goes to log in", async ({ page }) => {
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.fill("#name", "Pat");
  await page.fill("#email", PAT.email);
  await page.fill("#password", PAT.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/today", { waitUntil: "commit" });
  await logOut(page);

  // The emulator's GitHub window always says the email is verified, and the emulator then
  // merges GitHub into the existing account. Real Firebase does not trust GitHub that way:
  // it answers with needConfirmation (auth/account-exists-with-different-credential). So
  // answer this one request as production does; everything else here is the real emulator.
  await page.route("**/accounts:signInWithIdp*", (route) =>
    route.fulfill({
      json: {
        kind: "identitytoolkit#VerifyAssertionResponse",
        providerId: "github.com",
        federatedId: `https://github.com/pat-${run}`,
        email: PAT.email,
        emailVerified: true,
        needConfirmation: true,
      },
    }),
  );
  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await inGitHubWindow(page, () => githubButton(page, "up").click(), { email: PAT.email, name: "Pat" });
  const note = page.locator(".note[role=alert]");
  await expect(note).toContainText("This email already has an account");
  await expect(note).toContainText("Log in with your password first. You can connect GitHub afterwards in Settings.");
  await note.getByRole("button", { name: "Log in with email" }).click();
  await page.waitForURL("**/login");
  expect((await emulatorAccounts()).filter((u) => u.email === PAT.email)).toHaveLength(1);
});

test("Settings: connect GitHub to a password account, then disconnect it", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", PAT.email);
  await page.fill("#password", PAT.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/today", { waitUntil: "commit" });

  await page.goto("/settings");
  await page.getByRole("heading", { name: "Sign-in methods" }).waitFor();
  await inGitHubWindow(page, () => page.getByRole("button", { name: "Connect GitHub" }).click(), { email: PAT_GITHUB, name: "Pat" });
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Sign-in methods" }) });
  await expect(section).toContainText(PAT_GITHUB);
  await expect(section).toContainText("You can sign in with any connected method.");

  await page.getByRole("button", { name: "Disconnect GitHub" }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect GitHub?" });
  await expect(dialog).toContainText("You will still be able to sign in with your password.");
  await dialog.getByRole("button", { name: "Disconnect" }).click();
  await expect(section).not.toContainText(PAT_GITHUB);
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
});
