import { Timestamp } from "firebase-admin/firestore";
import { FunctionsError } from "firebase/functions";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkInFor, undoCheckInFor } from "../src/checkins";
import { deleteHabitFor } from "../src/habits";
import { adminDb, clearFirestore, disposeClients, newClient } from "./helpers";

const UID = "u1";

async function seedUser(uid: string, fields: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      name: "Test",
      timezone: "Africa/Lagos",
      reminderEnabled: false,
      reminderTime: "20:00",
      theme: "system",
      freezesAvailable: 1,
      nextRolloverAt: Timestamp.now(),
      lastReminderDate: null,
      lastClosedDate: "2026-01-01",
      ...fields,
    });
}

async function seedHabit(uid: string, habitId: string, checkIns: string[] = [], freezes: string[] = []) {
  const ref = adminDb().doc(`users/${uid}/habits/${habitId}`);
  await ref.set({
    name: "Read",
    color: "#13795B",
    createdAt: Timestamp.now(),
    currentStreak: 0,
    bestStreak: 0,
    lastCheckInDate: null,
  });
  await Promise.all([
    ...checkIns.map((d) => ref.collection("checkIns").doc(d).set({ createdAt: Timestamp.now() })),
    ...freezes.map((d) => ref.collection("freezeUses").doc(d).set({ createdAt: Timestamp.now() })),
  ]);
  return ref;
}

async function checkInIds(uid: string, habitId: string) {
  const snap = await adminDb().collection(`users/${uid}/habits/${habitId}/checkIns`).get();
  return snap.docs.map((d) => d.id).sort();
}

const code = (c: string) => (e: unknown) =>
  (e as { code?: string }).code === c || (e as { code?: string }).code === `functions/${c}`;

// 10:00 UTC on 28 Oct 2026 = 11:00 in Lagos.
const NOW = new Date("2026-10-28T10:00:00Z");

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await disposeClients();
});

describe("checkInFor", () => {
  it("creates today's check-in, keyed by the server's local date, and updates stats", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-26", "2026-10-27"]);

    const res = await checkInFor(UID, "h1", NOW);

    expect(res).toEqual({ date: "2026-10-28", changed: true, currentStreak: 3, bestStreak: 3, lastCheckInDate: "2026-10-28" });
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    const habit = (await adminDb().doc(`users/${UID}/habits/h1`).get()).data();
    expect(habit).toMatchObject({ currentStreak: 3, bestStreak: 3, lastCheckInDate: "2026-10-28" });
  });

  it("uses the user's timezone: the same instant is a different day in Tokyo", async () => {
    // 22:30 UTC on 28 Oct = 23:30 in Lagos (still the 28th) but 07:30 on the 29th in Tokyo.
    const instant = new Date("2026-10-28T22:30:00Z");
    await seedUser("lagos");
    await seedUser("tokyo", { timezone: "Asia/Tokyo" });
    await seedHabit("lagos", "h");
    await seedHabit("tokyo", "h");

    expect((await checkInFor("lagos", "h", instant)).date).toBe("2026-10-28");
    expect((await checkInFor("tokyo", "h", instant)).date).toBe("2026-10-29");
  });

  it("is idempotent: a second check-in the same day changes nothing", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-27"]);

    const first = await checkInFor(UID, "h1", NOW);
    const second = await checkInFor(UID, "h1", new Date(NOW.getTime() + 60_000));

    expect(first.changed).toBe(true);
    expect(second).toEqual({ ...first, changed: false });
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-27", "2026-10-28"]);
  });

  it("leaves exactly one document under concurrent check-ins", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1");

    const results = await Promise.all(Array.from({ length: 5 }, () => checkInFor(UID, "h1", NOW)));

    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-28"]);
  });

  it("cannot reach another user's habit", async () => {
    await seedUser("alice");
    await seedUser("bob");
    await seedHabit("alice", "h1");

    await expect(checkInFor("bob", "h1", NOW)).rejects.toSatisfy(code("not-found"));
    expect(await checkInIds("alice", "h1")).toEqual([]);
  });

  it("refuses a day the rollover has already closed (timezone backfill)", async () => {
    // The user's 28th closed while they were in Lagos; they then moved to Los Angeles,
    // where it is still the 28th. The 28th must stay locked.
    await seedUser(UID, { timezone: "America/Los_Angeles", lastClosedDate: "2026-10-28" });
    await seedHabit(UID, "h1", ["2026-10-27"]);
    const laStillThe28th = new Date("2026-10-29T01:00:00Z"); // 18:00 on the 28th in LA

    await expect(checkInFor(UID, "h1", laStillThe28th)).rejects.toSatisfy(code("failed-precondition"));
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-27"]);
  });

  it("fails cleanly when the profile or habit is missing", async () => {
    await expect(checkInFor("nobody", "h1", NOW)).rejects.toSatisfy(code("failed-precondition"));
    await seedUser(UID);
    await expect(checkInFor(UID, "missing", NOW)).rejects.toSatisfy(code("not-found"));
  });
});

describe("undoCheckInFor", () => {
  it("removes today's check-in and recomputes stats", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-27"]);
    await checkInFor(UID, "h1", NOW);

    const res = await undoCheckInFor(UID, "h1", NOW);

    expect(res).toEqual({ date: "2026-10-28", changed: true, currentStreak: 1, bestStreak: 1, lastCheckInDate: "2026-10-27" });
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-27"]);
  });

  it("lowers the best streak if the undone day was part of it", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-26", "2026-10-27"]);
    expect((await checkInFor(UID, "h1", NOW)).bestStreak).toBe(3);
    expect((await undoCheckInFor(UID, "h1", NOW)).bestStreak).toBe(2);
  });

  it("is a no-op when there is nothing to undo today", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1", ["2026-10-27"]);
    const res = await undoCheckInFor(UID, "h1", NOW);
    expect(res.changed).toBe(false);
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-27"]);
  });

  it("cannot remove a past day's check-in", async () => {
    await seedUser(UID);
    await seedHabit(UID, "h1");
    await checkInFor(UID, "h1", NOW);

    // Next day in Lagos: undo targets the 29th, so the 28th stays.
    const res = await undoCheckInFor(UID, "h1", new Date("2026-10-29T10:00:00Z"));
    expect(res).toMatchObject({ date: "2026-10-29", changed: false });
    expect(await checkInIds(UID, "h1")).toEqual(["2026-10-28"]);
  });
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

describe("callables through the Functions emulator", () => {
  async function signedInWithHabit() {
    const client = newClient();
    const user = await client.signUp();
    await client.call("ensureProfile");
    await seedHabit(user.uid, "h1");
    return { client, uid: user.uid };
  }

  it("reject callers who are not signed in", async () => {
    const client = newClient();
    for (const name of ["checkIn", "undoCheckIn", "deleteHabit"]) {
      await expect(client.call(name, { habitId: "h1" })).rejects.toSatisfy(
        (e: unknown) => e instanceof FunctionsError && e.code === "functions/unauthenticated",
      );
    }
  });

  it("reject a missing or malformed habitId", async () => {
    const { client } = await signedInWithHabit();
    for (const data of [{}, { habitId: "" }, { habitId: "a/b" }, { habitId: 42 }]) {
      await expect(client.call("checkIn", data)).rejects.toSatisfy(code("invalid-argument"));
    }
  });

  it("checkIn twice leaves one document and does not error", async () => {
    const { client, uid } = await signedInWithHabit();

    const first = (await client.call("checkIn", { habitId: "h1" })) as { changed: boolean; date: string };
    const second = (await client.call("checkIn", { habitId: "h1" })) as { changed: boolean };

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(await checkInIds(uid, "h1")).toEqual([first.date]);
  });

  it("ignores any date the client tries to send", async () => {
    const { client, uid } = await signedInWithHabit();
    const res = (await client.call("checkIn", { habitId: "h1", date: "2020-01-01" })) as { date: string };
    expect(res.date).not.toBe("2020-01-01");
    expect(await checkInIds(uid, "h1")).toEqual([res.date]);
  });

  it("user B cannot check in, undo or delete on user A's habit", async () => {
    const a = await signedInWithHabit();
    await a.client.call("checkIn", { habitId: "h1" });
    const before = await checkInIds(a.uid, "h1");

    const b = newClient();
    await b.signUp();
    await b.call("ensureProfile");

    await expect(b.call("checkIn", { habitId: "h1" })).rejects.toSatisfy(code("not-found"));
    await expect(b.call("undoCheckIn", { habitId: "h1" })).rejects.toSatisfy(code("not-found"));
    expect(await b.call("deleteHabit", { habitId: "h1" })).toEqual({ deleted: false });

    expect(await checkInIds(a.uid, "h1")).toEqual(before);
    expect((await adminDb().doc(`users/${a.uid}/habits/h1`).get()).exists).toBe(true);
  });

  it("undoCheckIn and deleteHabit work for the owner", async () => {
    const { client, uid } = await signedInWithHabit();
    await client.call("checkIn", { habitId: "h1" });
    expect(await client.call("undoCheckIn", { habitId: "h1" })).toMatchObject({ changed: true, currentStreak: 0 });
    expect(await checkInIds(uid, "h1")).toEqual([]);

    await client.call("checkIn", { habitId: "h1" });
    expect(await client.call("deleteHabit", { habitId: "h1" })).toEqual({ deleted: true });
    expect(await checkInIds(uid, "h1")).toEqual([]);
  });
});
