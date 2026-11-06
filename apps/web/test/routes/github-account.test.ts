import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  getAuth,
  linkWithCredential,
  OAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  signOut,
  unlink,
  type Auth,
  type User,
} from "firebase/auth";
import { auth as adminAuth, emulatorProjectId } from "@streaks/core";
import { adminDb, clearAuth, clearFirestore, setTokensValidSince, withClaims } from "@streaks/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as deleteAccount } from "@/app/api/delete-account/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { addPassword } from "@/lib/add-password";
import {
  canDisconnect,
  existingMethod,
  GITHUB_PROVIDER,
  GOOGLE_PROVIDER,
  PASSWORD_PROVIDER,
  reauthProvider,
  settingsError,
  signInNote,
} from "@/lib/sign-in";
import { post } from "./helpers";

// The real client SDK against the Auth emulator, doing what lib/auth.tsx does for GitHub.
// Popups need a browser (e2e/github.spec.ts drives the emulator's real GitHub window), so
// these use the credential a popup would produce: the emulator takes a fake ID token for
// any provider, and link, unlink and reauthenticate are then the same operations.

const PASSWORD = "password123";

let app: FirebaseApp;
let auth: Auth;

beforeEach(async () => {
  await Promise.all([clearFirestore(), clearAuth()]);
  app = initializeApp({ apiKey: "demo-key", projectId: emulatorProjectId() }, `github-${Date.now()}-${Math.random()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
});

afterEach(async () => {
  await deleteApp(app);
});

interface GitHubProfile {
  sub: string;
  email?: string;
  name?: string;
}

// email_verified false: real Firebase does not treat GitHub as a trusted provider, so an email
// that already has an account is refused, never merged. The emulator merges a *verified* email
// instead, so the tests say unverified to behave like production.
const credential = ({ sub, email, name }: GitHubProfile) =>
  new OAuthProvider(GITHUB_PROVIDER).credential({ idToken: JSON.stringify({ sub, email, name, email_verified: false }) });
const github = async (profile: GitHubProfile) => (await signInWithCredential(auth, credential(profile))).user;
const google = async (sub: string, email: string) =>
  (await signInWithCredential(auth, new OAuthProvider(GOOGLE_PROVIDER).credential({ idToken: JSON.stringify({ sub, email, email_verified: true }) }))).user;
const withPassword = async (email: string) => (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user;
const providers = (user: User) => user.providerData.map((p) => p.providerId).sort();
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "no error",
    (e: { code: string }) => e.code,
  );
const profileName = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).get("name") as string | undefined;

const ADA = { sub: "gh-ada", email: "ada@example.com", name: "Ada Obi" };

describe("signing up and in with GitHub", () => {
  it("creates one account with the GitHub email, and finds it again on return", async () => {
    const first = await github(ADA);
    expect(first.email).toBe(ADA.email);
    expect(providers(first)).toEqual([GITHUB_PROVIDER]);
    // No password: GitHub confirms it is them, to set one or to delete the account.
    expect(reauthProvider(providers(first))).toBe(GITHUB_PROVIDER);
    await signOut(auth);
    expect((await github(ADA)).uid).toBe(first.uid);
  });

  it("names the profile from the GitHub name, else the email, within 50 characters", async () => {
    const named = await github(ADA);
    expect((await post(ensureProfile, {}, { token: await named.getIdToken() })).status).toBe(200);
    expect(await profileName(named.uid)).toBe("Ada");
    await signOut(auth);

    const unnamed = await github({ sub: "gh-b", email: "b.okafor@example.com" });
    await post(ensureProfile, {}, { token: await unnamed.getIdToken() });
    expect(await profileName(unnamed.uid)).toBe("b.okafor");
    await signOut(auth);

    const long = await github({ sub: "gh-c", email: "c@example.com", name: "X".repeat(80) });
    await post(ensureProfile, {}, { token: await long.getIdToken() });
    expect(await profileName(long.uid)).toBe("X".repeat(50));
  });

  it("gives the uid only from the verified token, whatever the body says", async () => {
    const user = await github(ADA);
    const res = await post(ensureProfile, { uid: "someone-else" }, { token: await user.getIdToken() });
    expect(res.status).toBe(200);
    expect((await adminDb().doc("users/someone-else").get()).exists).toBe(false);
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(true);
  });

  it("can sign in a GitHub account that shared no email, which the app then undoes", async () => {
    // What lib/auth.tsx guards against: the emulator, like GitHub, allows it.
    const user = await github({ sub: "gh-noemail" });
    expect(user.email).toBeNull();
    await user.delete();
    await expect(adminAuth().getUser(user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(false);
  });
});

describe("an email that already has an account", () => {
  it("is not merged into a password account; the password is named", async () => {
    await withPassword("d@example.com");
    await signOut(auth);
    const code = await codeOf(github({ sub: "gh-d", email: "d@example.com" }));
    expect(code).toBe("auth/account-exists-with-different-credential");
    const existing = existingMethod(await fetchSignInMethodsForEmail(auth, "d@example.com"), GITHUB_PROVIDER);
    expect(existing).toBe(PASSWORD_PROVIDER);
    expect(signInNote(GITHUB_PROVIDER, code, existing).action?.does).toBe("go-to-login");
  });

  it("is not merged into a Google account; Google is named", async () => {
    await google("g-e", "e@example.com");
    await signOut(auth);
    const code = await codeOf(github({ sub: "gh-e", email: "e@example.com" }));
    expect(code).toBe("auth/account-exists-with-different-credential");
    const existing = existingMethod(await fetchSignInMethodsForEmail(auth, "e@example.com"), GITHUB_PROVIDER);
    expect(existing).toBe(GOOGLE_PROVIDER);
    expect(signInNote(GITHUB_PROVIDER, code, existing).action?.does).toBe("use-google");
  });
});

describe("Settings: connecting and disconnecting GitHub", () => {
  it("connects GitHub to a password account; both then sign in to the same user", async () => {
    const user = await withPassword("f@example.com");
    await linkWithCredential(user, credential({ sub: "gh-f", email: "f@example.com" }));
    expect(providers(user)).toEqual([GITHUB_PROVIDER, PASSWORD_PROVIDER]);
    expect(user.providerData.find((p) => p.providerId === GITHUB_PROVIDER)?.email).toBe("f@example.com");
    await signOut(auth);
    expect((await github({ sub: "gh-f", email: "f@example.com" })).uid).toBe(user.uid);
  });

  it("disconnects GitHub while a password remains, and then refuses the last method", async () => {
    const user = await withPassword("g@example.com");
    await linkWithCredential(user, credential({ sub: "gh-g", email: "g@example.com" }));
    expect(canDisconnect(providers(user), GITHUB_PROVIDER)).toBe(true);
    await unlink(user, GITHUB_PROVIDER);
    expect(providers(user)).toEqual([PASSWORD_PROVIDER]);
    expect(canDisconnect(providers(user), PASSWORD_PROVIDER)).toBe(false);
  });

  it("says so when the GitHub account already belongs to someone else", async () => {
    await github({ sub: "gh-taken", email: "taken@example.com" });
    await signOut(auth);
    const user = await withPassword("h@example.com");
    const code = await codeOf(linkWithCredential(user, credential({ sub: "gh-taken", email: "taken@example.com" })));
    expect(code).toBe("auth/credential-already-in-use");
    expect(settingsError(GITHUB_PROVIDER, code)).toBe("That GitHub account is already connected to a different Streaks account.");
    expect(providers(user)).toEqual([PASSWORD_PROVIDER]);
  });

  it("sets a password on a GitHub-only account after confirming with GitHub", async () => {
    const user = await github(ADA);
    expect(canDisconnect(providers(user), GITHUB_PROVIDER)).toBe(false);
    await reauthenticateWithCredential(user, credential(ADA));
    await addPassword(user, PASSWORD);
    await user.reload();
    expect(providers(user)).toEqual([GITHUB_PROVIDER, PASSWORD_PROVIDER]);
    expect(canDisconnect(providers(user), GITHUB_PROVIDER)).toBe(true);
  });
});

describe("deleting a GitHub-only account", () => {
  it("is refused when the sign-in is stale, and works after confirming with GitHub", async () => {
    const user = await github(ADA);
    await post(ensureProfile, {}, { token: await user.getIdToken() });
    const nowSeconds = Math.floor(Date.now() / 1000);
    await setTokensValidSince(user.uid, nowSeconds - 1200);
    const stale = withClaims(await user.getIdToken(true), { auth_time: nowSeconds - 600 });

    const refused = await post(deleteAccount, {}, { token: stale });
    expect(refused.status).toBe(403);
    expect(refused.json.error.details).toEqual({ reason: "requires-recent-login" });

    await reauthenticateWithCredential(user, credential(ADA));
    expect(await post(deleteAccount, {}, { token: await user.getIdToken(true) })).toEqual({ status: 200, json: { deleted: true } });
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(false);
    await expect(adminAuth().getUser(user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
});
