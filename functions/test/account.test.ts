import { getAuth } from "firebase-admin/auth";
import { getApps } from "firebase-admin/app";
import { FunctionsError } from "firebase/functions";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteAccountFor } from "../src/account";
import { tokenId } from "../src/push";
import { adminDb, clearFirestore, disposeClients, newClient, seedHabit } from "./helpers";

const code = (c: string) => (e: unknown) => e instanceof FunctionsError && e.code === `functions/${c}`;

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await disposeClients();
});

describe("registerPushToken / removePushToken", () => {
  it("reject callers who are not signed in, and bad tokens", async () => {
    const anon = newClient();
    await expect(anon.call("registerPushToken", { token: "abc" })).rejects.toSatisfy(code("unauthenticated"));
    await expect(anon.call("removePushToken", { token: "abc" })).rejects.toSatisfy(code("unauthenticated"));

    const client = newClient();
    await client.signUp();
    await expect(client.call("registerPushToken", {})).rejects.toSatisfy(code("invalid-argument"));
    await expect(client.call("registerPushToken", { token: "" })).rejects.toSatisfy(code("invalid-argument"));
  });

  it("saves one document per device, however often it registers", async () => {
    const client = newClient();
    const user = await client.signUp();
    await client.call("registerPushToken", { token: "device-token-1" });
    await client.call("registerPushToken", { token: "device-token-1" });

    const docs = (await adminDb().collection(`users/${user.uid}/pushTokens`).get()).docs;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe(tokenId("device-token-1"));
    expect(docs[0]!.data()).toMatchObject({ token: "device-token-1" });
    expect(docs[0]!.get("createdAt")).toBeTruthy();
  });

  it("moves a device to whoever registered it last", async () => {
    const a = newClient();
    const ua = await a.signUp();
    await a.call("registerPushToken", { token: "shared-browser" });

    const b = newClient();
    const ub = await b.signUp();
    await b.call("registerPushToken", { token: "shared-browser" });

    expect((await adminDb().collection(`users/${ua.uid}/pushTokens`).get()).size).toBe(0);
    expect((await adminDb().collection(`users/${ub.uid}/pushTokens`).get()).size).toBe(1);
  });

  it("removes only the caller's own token", async () => {
    const client = newClient();
    const user = await client.signUp();
    await client.call("registerPushToken", { token: "t1" });
    await client.call("registerPushToken", { token: "t2" });

    expect(await client.call("removePushToken", { token: "t1" })).toEqual({ removed: true });
    expect(await client.call("removePushToken", { token: "t1" })).toEqual({ removed: false });
    const left = (await adminDb().collection(`users/${user.uid}/pushTokens`).get()).docs.map((d) => d.get("token"));
    expect(left).toEqual(["t2"]);
  });
});

describe("deleteAccount", () => {
  it("rejects callers who are not signed in", async () => {
    await expect(newClient().call("deleteAccount")).rejects.toSatisfy(code("unauthenticated"));
  });

  it("refuses without a recent sign-in, and deletes nothing", async () => {
    await adminDb().doc("users/u1").set({ name: "Stale" });
    const now = new Date("2026-10-28T12:00:00Z");
    const tenMinutesAgo = now.getTime() / 1000 - 600;

    await expect(deleteAccountFor("u1", tenMinutesAgo, now)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(deleteAccountFor("u1", undefined, now)).rejects.toMatchObject({ code: "failed-precondition" });
    expect((await adminDb().doc("users/u1").get()).exists).toBe(true);
  });

  it("deletes the whole users/{uid} tree and then the Auth user", async () => {
    const client = newClient();
    const user = await client.signUp();
    await client.call("ensureProfile");
    await seedHabit(user.uid, "h1", ["2026-10-27"], ["2026-10-26"]);
    await client.call("registerPushToken", { token: "dev" });
    // Someone else's data must survive.
    const other = newClient();
    const otherUser = await other.signUp();
    await other.call("ensureProfile");

    expect(await client.call("deleteAccount")).toEqual({ deleted: true });

    const db = adminDb();
    expect((await db.doc(`users/${user.uid}`).get()).exists).toBe(false);
    expect((await db.collection(`users/${user.uid}/habits`).get()).size).toBe(0);
    expect((await db.collection(`users/${user.uid}/habits/h1/checkIns`).get()).size).toBe(0);
    expect((await db.collection(`users/${user.uid}/pushTokens`).get()).size).toBe(0);
    await expect(getAuth(getApps()[0]).getUser(user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await db.doc(`users/${otherUser.uid}`).get()).exists).toBe(true);

    // The deleted user's still-valid session cannot bring the profile back.
    await expect(client.call("ensureProfile")).rejects.toSatisfy(code("failed-precondition"));
    expect((await db.doc(`users/${user.uid}`).get()).exists).toBe(false);
  });

  it("ensureProfile refuses an account that is being deleted (disabled)", async () => {
    const client = newClient();
    const user = await client.signUp();
    await getAuth(getApps()[0]).updateUser(user.uid, { disabled: true });

    await expect(client.call("ensureProfile")).rejects.toSatisfy(code("failed-precondition"));
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(false);
  });
});
