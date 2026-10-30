import { auth, tokenId } from "@streaks/core";
import {
  adminDb,
  clearFirestore,
  seedHabit,
  setTokensValidSince,
  signUpUser,
  withClaims,
  type TestUser,
} from "@streaks/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as deleteAccount } from "@/app/api/delete-account/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as registerPushToken } from "@/app/api/register-push-token/route";
import { POST as removePushToken } from "@/app/api/remove-push-token/route";
import { post } from "./helpers";

beforeEach(async () => {
  await clearFirestore();
});

async function userWithProfile(): Promise<TestUser> {
  const user = await signUpUser();
  expect((await post(ensureProfile, {}, { token: user.idToken })).status).toBe(200);
  return user;
}

const tokens = async (uid: string) =>
  (await adminDb().collection(`users/${uid}/pushTokens`).get()).docs.map((d) => d.get("token") as string).sort();

describe("POST /api/register-push-token and /api/remove-push-token", () => {
  it("save one document per device, keyed by a hash of the token, with the user agent", async () => {
    const user = await userWithProfile();
    const req = async () => {
      const res = await fetchWithUserAgent(user.idToken, { token: "device-token-1" });
      expect(res.status).toBe(200);
    };
    await req();
    await req();

    const docs = (await adminDb().collection(`users/${user.uid}/pushTokens`).get()).docs;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe(tokenId("device-token-1"));
    expect(docs[0]!.data()).toMatchObject({ token: "device-token-1", userAgent: "TestBrowser/1.0" });
  });

  it("400 for a missing or malformed token", async () => {
    const user = await userWithProfile();
    for (const handler of [registerPushToken, removePushToken]) {
      for (const body of [{}, { token: "" }, { token: 5 }, { token: "x".repeat(4097) }]) {
        expect((await post(handler, body, { token: user.idToken })).status, JSON.stringify(body)).toBe(400);
      }
    }
  });

  it("move a device to whoever registered it last", async () => {
    const a = await userWithProfile();
    await post(registerPushToken, { token: "shared-browser" }, { token: a.idToken });
    const b = await userWithProfile();
    await post(registerPushToken, { token: "shared-browser" }, { token: b.idToken });

    expect(await tokens(a.uid)).toEqual([]);
    expect(await tokens(b.uid)).toEqual(["shared-browser"]);
  });

  it("remove only the caller's own token; another user's stays", async () => {
    const a = await userWithProfile();
    await post(registerPushToken, { token: "a-phone" }, { token: a.idToken });
    await post(registerPushToken, { token: "a-laptop" }, { token: a.idToken });
    const b = await userWithProfile();

    // B tries to remove A's token, naming A in the body: nothing happens to A.
    const res = await post(removePushToken, { token: "a-phone", uid: a.uid }, { token: b.idToken });
    expect(res.json).toEqual({ removed: false });
    expect(await tokens(a.uid)).toEqual(["a-laptop", "a-phone"]);

    expect((await post(removePushToken, { token: "a-phone" }, { token: a.idToken })).json).toEqual({ removed: true });
    expect((await post(removePushToken, { token: "a-phone" }, { token: a.idToken })).json).toEqual({ removed: false });
    expect(await tokens(a.uid)).toEqual(["a-laptop"]);
  });
});

/** register-push-token with a User-Agent header, which the route stores. */
async function fetchWithUserAgent(idToken: string, body: unknown) {
  return registerPushToken(
    new Request("http://localhost/api/register-push-token", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, "user-agent": "TestBrowser/1.0" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/delete-account", () => {
  it("deletes the whole users/{uid} tree and then the Auth user, and nobody else's data", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1", ["2026-10-27"], ["2026-10-26"]);
    await post(registerPushToken, { token: "dev" }, { token: user.idToken });
    const other = await userWithProfile();
    await seedHabit(other.uid, "h1", ["2026-10-27"]);

    const res = await post(deleteAccount, {}, { token: user.idToken });
    expect(res).toEqual({ status: 200, json: { deleted: true } });

    const db = adminDb();
    expect((await db.doc(`users/${user.uid}`).get()).exists).toBe(false);
    for (const sub of ["habits", "habits/h1/checkIns", "habits/h1/freezeUses", "pushTokens"]) {
      expect((await db.collection(`users/${user.uid}/${sub}`).get()).size, sub).toBe(0);
    }
    await expect(auth().getUser(user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await db.doc(`users/${other.uid}/habits/h1`).get()).exists).toBe(true);

    // The deleted user's old token cannot bring the profile back.
    expect((await post(ensureProfile, {}, { token: user.idToken })).status).not.toBe(200);
    expect((await db.doc(`users/${user.uid}`).get()).exists).toBe(false);
  });

  it("403 requires-recent-login when the token's sign-in is older than 5 minutes, and deletes nothing", async () => {
    const user = await userWithProfile();
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Signed in 10 minutes ago, in a session that is not revoked (valid since 20 minutes ago).
    await setTokensValidSince(user.uid, nowSeconds - 1200);
    const stale = withClaims(user.idToken, { auth_time: nowSeconds - 600 });

    const res = await post(deleteAccount, {}, { token: stale });
    expect(res.status).toBe(403);
    expect(res.json.error).toMatchObject({ code: "permission-denied", details: { reason: "requires-recent-login" } });
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(true);
    expect((await auth().getUser(user.uid)).disabled).toBe(false);
  });

  it("deletes the token's user, never a uid from the body", async () => {
    const a = await userWithProfile();
    const b = await userWithProfile();
    expect((await post(deleteAccount, { uid: a.uid }, { token: b.idToken })).status).toBe(200);
    expect((await adminDb().doc(`users/${a.uid}`).get()).exists).toBe(true);
    expect((await auth().getUser(a.uid)).uid).toBe(a.uid);
    expect((await adminDb().doc(`users/${b.uid}`).get()).exists).toBe(false);
  });

  it("asks the Admin SDK to check revocation", async () => {
    // The emulator checks revocation on every verifyIdToken call, so the behaviour test
    // below would pass even without the flag. Production only checks when asked.
    const user = await userWithProfile();
    const spy = vi.spyOn(auth(), "verifyIdToken");
    try {
      await post(deleteAccount, {}, { token: user.idToken });
      expect(spy).toHaveBeenCalledWith(user.idToken, true);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a revoked session", async () => {
    const user = await userWithProfile();
    // Revocation compares whole seconds: a sign-in in the same second still counts as valid.
    await new Promise((r) => setTimeout(r, 1100));
    await auth().revokeRefreshTokens(user.uid);
    const res = await post(deleteAccount, {}, { token: user.idToken });
    expect(res.status).toBe(401);
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(true);
  });
});
