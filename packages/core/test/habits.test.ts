import { beforeEach, describe, expect, it } from "vitest";
import { deleteHabitFor } from "../src/habits";
import { adminDb, checkInIds, clearFirestore, seedHabit, seedUser } from "../src/testing";

const UID = "u1";

beforeEach(async () => {
  await clearFirestore();
});

describe("deleteHabitFor", () => {
  it("deletes the habit and its subcollections", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-26", "2026-10-27"], ["2026-10-25"]);
    await seedHabit(UID, "keep", ["2026-10-27"]);

    expect(await deleteHabitFor(UID, "h1")).toEqual({ deleted: true });

    const db = adminDb();
    expect((await db.doc(`users/${UID}/habits/h1`).get()).exists).toBe(false);
    expect((await db.collection(`users/${UID}/habits/h1/checkIns`).get()).size).toBe(0);
    expect((await db.collection(`users/${UID}/habits/h1/freezeUses`).get()).size).toBe(0);
    expect(await checkInIds(UID, "keep")).toEqual(["2026-10-27"]);
  });

  it("is a no-op for a habit that does not exist", async () => {
    await seedUser(UID);
    expect(await deleteHabitFor(UID, "missing")).toEqual({ deleted: false });
  });
});
