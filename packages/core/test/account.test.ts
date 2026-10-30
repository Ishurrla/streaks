import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccountFor } from "../src/account";
import { adminDb, clearFirestore } from "../src/testing";

beforeEach(async () => {
  await clearFirestore();
});

describe("deleteAccountFor", () => {
  it("refuses without a recent sign-in, and deletes nothing", async () => {
    await adminDb().doc("users/u1").set({ name: "Stale" });
    const now = new Date("2026-10-28T12:00:00Z");
    const tenMinutesAgo = now.getTime() / 1000 - 600;

    for (const authTime of [tenMinutesAgo, undefined]) {
      await expect(deleteAccountFor("u1", authTime, now)).rejects.toMatchObject({
        code: "permission-denied",
        details: { reason: "requires-recent-login" },
      });
    }
    expect((await adminDb().doc("users/u1").get()).exists).toBe(true);
  });

  it("still deletes the data when the Auth user is already gone (a retry)", async () => {
    await adminDb().doc("users/ghost/habits/h1").set({ name: "Read" });
    const now = new Date();
    expect(await deleteAccountFor("ghost", now.getTime() / 1000, now)).toEqual({ deleted: true });
    expect((await adminDb().collection("users/ghost/habits").get()).size).toBe(0);
  });
});
