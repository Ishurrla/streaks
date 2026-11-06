import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  unlink,
  type Auth,
  type User,
} from "firebase/auth";
import { auth as adminAuth, emulatorProjectId } from "@streaks/core";
import {
  adminDb,
  clearAuth,
  clearFirestore,
  fakeGoogleIdToken,
  seedHabit,
  setTokensValidSince,
  withClaims,
  type GoogleProfile,
} from "@streaks/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as deleteAccount } from "@/app/api/delete-account/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { addPassword } from "@/lib/add-password";
import {
  canDisconnect,
  existingMethod,
  GOOGLE_PROVIDER,
  googleSettingsError,
  googleSignInNote,
  PASSWORD_PROVIDER,
  reauthProvider,
} from "@/lib/sign-in";
import { post } from "./helpers";

// The real client SDK against the Auth emulator, doing what lib/auth.tsx does. Popups need a
// browser, so these use the credential a popup would produce, a fake Google ID token the
// emulator accepts: link, unlink and reauthenticate are then the same operations.

const PASSWORD = "password123";
// The emulator returns the first; a project with email enumeration protection, the second.
const WRONG_PASSWORD = ["auth/wrong-password", "auth/invalid-credential"];

let app: FirebaseApp;
let auth: Auth;

beforeEach(async () => {
  // These tests depend on which accounts exist, so each starts with none.
  await Promise.all([clearFirestore(), clearAuth()]);
  app = initializeApp({ apiKey: "demo-key", projectId: emulatorProjectId() }, `google-${Date.now()}-${Math.random()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
});

afterEach(async () => {
  await deleteApp(app);
});

const credential = (profile: GoogleProfile) => GoogleAuthProvider.credential(fakeGoogleIdToken(profile));
const google = async (profile: GoogleProfile) => (await signInWithCredential(auth, credential(profile))).user;
const withPassword = async (email: string) => (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user;
const providers = (user: User) => user.providerData.map((p) => p.providerId).sort();
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "no error",
    (e: { code: string }) => e.code,
  );

const ADA = { sub: "g-ada", email: "ada@example.com", name: "Ada Obi" };

describe("signing in with Google", () => {
  it("creates one account, and finds it again on return", async () => {
    const first = await google(ADA);
    // No password: Google confirms it is them, for a new password or deleting the account.
    expect(reauthProvider(providers(first))).toBe(GOOGLE_PROVIDER);
    await signOut(auth);
    expect((await google(ADA)).uid).toBe(first.uid);
  });

  it("returns the existing-account error when the Google email is not verified", async () => {
    await withPassword("a@example.com");
    await signOut(auth);
    const code = await codeOf(google({ sub: "g-a", email: "a@example.com", emailVerified: false }));
    expect(code).toBe("auth/account-exists-with-different-credential");
    // The emulator has no email enumeration protection, so the existing method is known.
    const existing = existingMethod(await fetchSignInMethodsForEmail(auth, "a@example.com"), GOOGLE_PROVIDER);
    expect(existing).toBe(PASSWORD_PROVIDER);
    expect(googleSignInNote(code, existing).action?.does).toBe("go-to-login");
  });

  it("keeps an unverified password account's uid and data, but removes its password", async () => {
    // Firebase's protection against someone registering another person's address first.
    const before = await withPassword("b@gmail.com");
    await seedHabit(before.uid, "h1", ["2026-10-27"]);
    await signOut(auth);

    const after = await google({ sub: "g-b", email: "b@gmail.com", name: "B" });
    expect(after.uid).toBe(before.uid);
    expect(providers(after)).toEqual([GOOGLE_PROVIDER]);
    expect((await adminDb().doc(`users/${before.uid}/habits/h1`).get()).exists).toBe(true);

    await signOut(auth);
    expect(WRONG_PASSWORD).toContain(await codeOf(signInWithEmailAndPassword(auth, "b@gmail.com", PASSWORD)));
  });
});

describe("Settings: connecting and disconnecting Google", () => {
  it("links Google to a password account, and both then sign in to the same user", async () => {
    const user = await withPassword("c@example.com");
    await linkWithCredential(user, credential({ sub: "g-c", email: "c@example.com" }));
    expect(providers(user)).toEqual([GOOGLE_PROVIDER, PASSWORD_PROVIDER]);

    await signOut(auth);
    expect((await google({ sub: "g-c", email: "c@example.com" })).uid).toBe(user.uid);
    await signOut(auth);
    expect((await signInWithEmailAndPassword(auth, "c@example.com", PASSWORD)).user.uid).toBe(user.uid);
  });

  it("disconnects Google when a password remains, and the rule then refuses the last method", async () => {
    const user = await withPassword("d@example.com");
    await linkWithCredential(user, credential({ sub: "g-d", email: "d@example.com" }));
    expect(canDisconnect(providers(user), GOOGLE_PROVIDER)).toBe(true);

    await unlink(user, GOOGLE_PROVIDER);
    expect(providers(user)).toEqual([PASSWORD_PROVIDER]);
    expect(canDisconnect(providers(user), GOOGLE_PROVIDER)).toBe(false);
    expect(canDisconnect(providers(user), PASSWORD_PROVIDER)).toBe(false);
  });

  it("says so when the Google account already belongs to someone else", async () => {
    await google({ sub: "g-taken", email: "taken@example.com" });
    await signOut(auth);
    const user = await withPassword("e@example.com");
    const code = await codeOf(linkWithCredential(user, credential({ sub: "g-taken", email: "taken@example.com" })));
    expect(code).toBe("auth/credential-already-in-use");
    expect(googleSettingsError(code)).toBe("That Google account is already connected to another Streaks account.");
    expect(providers(user)).toEqual([PASSWORD_PROVIDER]);
  });
});

describe("Settings: setting a password on a Google-only account", () => {
  it("reauthenticates with Google, then links the password to the same user", async () => {
    const user = await google(ADA);
    expect(canDisconnect(providers(user), GOOGLE_PROVIDER)).toBe(false);

    await reauthenticateWithCredential(user, credential(ADA));
    await addPassword(user, PASSWORD);
    await user.reload();
    expect(providers(user)).toEqual([GOOGLE_PROVIDER, PASSWORD_PROVIDER]);
    expect(canDisconnect(providers(user), GOOGLE_PROVIDER)).toBe(true);

    await signOut(auth);
    expect((await signInWithEmailAndPassword(auth, ADA.email, PASSWORD)).user.uid).toBe(user.uid);
  });

  it("refuses to reauthenticate with a different Google account", async () => {
    const user = await google(ADA);
    const code = await codeOf(reauthenticateWithCredential(user, credential({ sub: "g-other", email: "other@example.com" })));
    expect(code).toBe("auth/user-mismatch");
    expect(googleSettingsError(code)).toBe("Choose the Google account you use for Streaks.");
  });
});

describe("Deleting an account needs a recent sign-in, whichever way it is confirmed", () => {
  /** A token as if the sign-in were 10 minutes old, in a session that is not revoked. */
  async function staleToken(user: User) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await setTokensValidSince(user.uid, nowSeconds - 1200);
    return withClaims(await user.getIdToken(true), { auth_time: nowSeconds - 600 });
  }

  const remains = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).exists;

  it("Google-only: refused when stale, deleted after reauthenticating with Google", async () => {
    const user = await google(ADA);
    await post(ensureProfile, {}, { token: await user.getIdToken() });

    const stale = await post(deleteAccount, {}, { token: await staleToken(user) });
    expect(stale.status).toBe(403);
    expect(stale.json.error.details).toEqual({ reason: "requires-recent-login" });
    expect(await remains(user.uid)).toBe(true);

    await reauthenticateWithCredential(user, credential(ADA));
    const res = await post(deleteAccount, {}, { token: await user.getIdToken(true) });
    expect(res).toEqual({ status: 200, json: { deleted: true } });
    expect(await remains(user.uid)).toBe(false);
    await expect(adminAuth().getUser(user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("password: refused when stale, deleted after reauthenticating with the password", async () => {
    const user = await withPassword("f@example.com");
    await post(ensureProfile, {}, { token: await user.getIdToken() });

    expect((await post(deleteAccount, {}, { token: await staleToken(user) })).status).toBe(403);
    expect(await remains(user.uid)).toBe(true);

    await reauthenticateWithCredential(user, EmailAuthProvider.credential("f@example.com", PASSWORD));
    expect((await post(deleteAccount, {}, { token: await user.getIdToken(true) })).status).toBe(200);
    expect(await remains(user.uid)).toBe(false);
  });

  it("password: a wrong password does not reauthenticate", async () => {
    const user = await withPassword("g@example.com");
    const code = await codeOf(reauthenticateWithCredential(user, EmailAuthProvider.credential("g@example.com", "wrong-password")));
    expect(WRONG_PASSWORD).toContain(code);
  });
});
