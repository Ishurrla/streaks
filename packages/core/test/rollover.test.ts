import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { checkInFor } from "../src/checkins";
import { rolloverUser, runRollover } from "../src/rollover";
import { computeStreaks } from "../src/streaks";
import { adminDb, checkInIds, clearFirestore, seedHabit, seedUser } from "../src/testing";

// Lagos is UTC+1 all year. Its midnight starting 29 Oct 2026 is 23:00Z on the 28th.
const LAGOS_MIDNIGHT_29 = new Date("2026-10-28T23:00:00Z");
const LAGOS_MIDNIGHT_30 = new Date("2026-10-29T23:00:00Z");
// The scheduler fires a few minutes after midnight.
const NOW = new Date("2026-10-28T23:05:00Z"); // 00:05 on the 29th in Lagos

const ts = (d: Date) => Timestamp.fromDate(d);

/** A Lagos user whose day (the 28th) has just ended. */
async function seedDueUser(uid: string, fields: Record<string, unknown> = {}) {
  await seedUser(uid, { nextRolloverAt: ts(LAGOS_MIDNIGHT_29), lastClosedDate: "2026-10-27", ...fields });
}

/** A habit with history whose stored stats are what they were during `asOf`. */
async function seedHabitWithStats(uid: string, id: string, checkIns: string[], freezes: string[] = [], asOf = "2026-10-28") {
  const ref = await seedHabit(uid, id, checkIns, freezes);
  await ref.update({ ...computeStreaks(checkIns, freezes, asOf) });
  return ref;
}

const userData = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).data()!;
const habitData = async (uid: string, id: string) => (await adminDb().doc(`users/${uid}/habits/${id}`).get()).data()!;
const freezeIds = async (uid: string, id: string) =>
  (await adminDb().collection(`users/${uid}/habits/${id}/freezeUses`).get()).docs.map((d) => d.id).sort();

beforeEach(async () => {
  await clearFirestore();
});

describe("runRollover", () => {
  it("breaks a missed streak when no freeze is available", async () => {
    await seedDueUser("u", { freezesAvailable: 0 });
    await seedHabitWithStats("u", "h", ["2026-10-26", "2026-10-27"]); // 28th missed

    expect(await runRollover(NOW)).toEqual({ rolledOver: 1, skipped: 0, failed: 0, done: true });

    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 0, bestStreak: 2, lastCheckInDate: "2026-10-27" });
    expect(await freezeIds("u", "h")).toEqual([]);
    const user = await userData("u");
    expect(user.nextRolloverAt.toDate()).toEqual(LAGOS_MIDNIGHT_30);
    expect(user.lastClosedDate).toBe("2026-10-28");
  });

  it("spends a freeze on a single missed day and keeps the streak", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", ["2026-10-26", "2026-10-27"]);

    await runRollover(NOW);

    expect(await freezeIds("u", "h")).toEqual(["2026-10-28"]);
    expect((await userData("u")).freezesAvailable).toBe(0);
    // 26, 27 and the frozen 28th: alive (at risk) on the 29th.
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 3, bestStreak: 3 });
  });

  it("spends a freeze only once, and breaks the streak the next time with none left", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", ["2026-10-26", "2026-10-27"]);

    await runRollover(NOW);
    await runRollover(new Date(NOW.getTime() + 15 * 60_000));
    expect(await freezeIds("u", "h")).toEqual(["2026-10-28"]);
    expect((await userData("u")).freezesAvailable).toBe(0);

    // Missed the 29th as well. Exactly one day missed (28th was frozen) but no freezes left.
    await runRollover(new Date("2026-10-29T23:05:00Z"));
    expect(await freezeIds("u", "h")).toEqual(["2026-10-28"]);
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 0, bestStreak: 3 });
  });

  it("does not spend a freeze when more than one day was missed", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", ["2026-10-25", "2026-10-26"], [], "2026-10-27"); // 27th and 28th missed

    await runRollover(NOW);

    expect(await freezeIds("u", "h")).toEqual([]);
    expect((await userData("u")).freezesAvailable).toBe(1);
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 0, bestStreak: 2 });
  });

  it("does not spend a freeze on a habit with no streak", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", []);

    await runRollover(NOW);

    expect((await userData("u")).freezesAvailable).toBe(1);
    expect(await freezeIds("u", "h")).toEqual([]);
  });

  it("gives a single freeze to the longest streak", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "short", ["2026-10-27"]);
    await seedHabitWithStats("u", "long", ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);

    await runRollover(NOW);

    expect(await freezeIds("u", "long")).toEqual(["2026-10-28"]);
    expect(await freezeIds("u", "short")).toEqual([]);
    expect((await habitData("u", "long")).currentStreak).toBe(5);
    expect((await habitData("u", "short")).currentStreak).toBe(0);
  });

  it("leaves habits done on the closed day alone", async () => {
    await seedDueUser("u");
    const ref = await seedHabitWithStats("u", "h", ["2026-10-27", "2026-10-28"]);
    const before = (await ref.get()).updateTime;

    await runRollover(NOW);

    expect((await ref.get()).updateTime).toEqual(before); // not written at all
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 2, bestStreak: 2 });
    expect((await userData("u")).freezesAvailable).toBe(1);
  });

  it("counts a check-in made after midnight but before the job ran", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", ["2026-10-27"]); // 28th missed
    await checkInFor("u", "h", new Date("2026-10-28T23:01:00Z")); // 00:01 on the 29th

    await runRollover(NOW);

    expect(await freezeIds("u", "h")).toEqual(["2026-10-28"]);
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 3, lastCheckInDate: "2026-10-29" });
  });

  it("only touches users whose local midnight has passed", async () => {
    await seedDueUser("lagos", { freezesAvailable: 0 });
    await seedHabitWithStats("lagos", "h", ["2026-10-27"]);
    // Los Angeles is UTC-7 in October; its midnight is 07:00Z on the 29th, still ahead.
    await seedUser("la", {
      timezone: "America/Los_Angeles",
      freezesAvailable: 0,
      nextRolloverAt: ts(new Date("2026-10-29T07:00:00Z")),
      lastClosedDate: "2026-10-27",
    });
    const laHabit = await seedHabitWithStats("la", "h", ["2026-10-27"]);
    const laUserBefore = await userData("la");
    const laHabitUpdated = (await laHabit.get()).updateTime;

    expect(await runRollover(NOW)).toEqual({ rolledOver: 1, skipped: 0, failed: 0, done: true });

    expect((await habitData("lagos", "h")).currentStreak).toBe(0);
    expect(await userData("la")).toEqual(laUserBefore);
    expect((await laHabit.get()).updateTime).toEqual(laHabitUpdated);
  });

  it("is safe to run twice: the second run changes nothing", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "frozen", ["2026-10-27"]);
    await seedHabitWithStats("u", "broken", ["2026-10-27"]);
    await seedHabitWithStats("u", "done", ["2026-10-28"]);

    await runRollover(NOW);
    const snapshot = async () => ({
      user: await userData("u"),
      habits: await Promise.all(["frozen", "broken", "done"].map((h) => habitData("u", h))),
      freezes: await Promise.all(["frozen", "broken", "done"].map((h) => freezeIds("u", h))),
    });
    const afterFirst = await snapshot();

    expect(await runRollover(NOW)).toEqual({ rolledOver: 0, skipped: 0, failed: 0, done: true });
    expect(await snapshot()).toEqual(afterFirst);

    // Even a forced second rollover of the same user is a no-op.
    expect(await rolloverUser("u", NOW)).toBe(false);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it("handles concurrent runs without spending a freeze twice", async () => {
    await seedDueUser("u", { freezesAvailable: 5 });
    await seedHabitWithStats("u", "h", ["2026-10-27"]);

    await Promise.all([runRollover(NOW), runRollover(NOW), runRollover(NOW)]);

    expect((await userData("u")).freezesAvailable).toBe(4);
    expect(await freezeIds("u", "h")).toEqual(["2026-10-28"]);
  });

  it("works through users in pages", async () => {
    for (let i = 0; i < 7; i++) {
      await seedDueUser(`u${i}`, { freezesAvailable: 0 });
      await seedHabitWithStats(`u${i}`, "h", ["2026-10-27"]);
    }

    expect(await runRollover(NOW, { pageSize: 3 })).toEqual({ rolledOver: 7, skipped: 0, failed: 0, done: true });
    for (let i = 0; i < 7; i++) expect((await habitData(`u${i}`, "h")).currentStreak).toBe(0);
  });

  it("keeps going when one user fails, and retries them next time", async () => {
    await seedDueUser("a", { freezesAvailable: 0 });
    await seedDueUser("broken", { timezone: "Not/AZone" });
    await seedDueUser("c", { freezesAvailable: 0 });
    for (const uid of ["a", "broken", "c"]) await seedHabitWithStats(uid, "h", ["2026-10-27"]);

    expect(await runRollover(NOW, { pageSize: 2 })).toEqual({ rolledOver: 2, skipped: 0, failed: 1, done: true });
    expect((await habitData("a", "h")).currentStreak).toBe(0);
    expect((await habitData("c", "h")).currentStreak).toBe(0);
    // The failed user is still due, so the next run picks them up again.
    expect((await userData("broken")).nextRolloverAt.toDate()).toEqual(LAGOS_MIDNIGHT_29);
    expect(await runRollover(NOW)).toEqual({ rolledOver: 0, skipped: 0, failed: 1, done: true });
  });

  it("catches up after the job was down for days", async () => {
    await seedDueUser("u");
    await seedHabitWithStats("u", "h", ["2026-10-26", "2026-10-27"]);
    const threeDaysLate = new Date("2026-10-31T10:00:00Z"); // 11:00 on the 31st in Lagos

    await runRollover(threeDaysLate);

    const user = await userData("u");
    expect(user.nextRolloverAt.toDate()).toEqual(new Date("2026-10-31T23:00:00Z"));
    expect(user.lastClosedDate).toBe("2026-10-30");
    expect(user.freezesAvailable).toBe(1); // 28th-30th missed: more than one day, no freeze
    expect((await habitData("u", "h")).currentStreak).toBe(0);
  });
});

describe("runRollover time budget", () => {
  it("stops starting new pages after the deadline, and the next run finishes the rest", async () => {
    for (let i = 0; i < 5; i++) {
      await seedDueUser(`u${i}`, { freezesAvailable: 0 });
      await seedHabitWithStats(`u${i}`, "h", ["2026-10-27"]);
    }

    // A deadline already in the past: one page is still processed, then it stops.
    const first = await runRollover(NOW, { pageSize: 2, deadline: 0 });
    expect(first).toEqual({ rolledOver: 2, skipped: 0, failed: 0, done: false });

    // Everyone not reached is still due, so later runs carry on where it stopped.
    const second = await runRollover(NOW, { pageSize: 2 });
    expect(second).toEqual({ rolledOver: 3, skipped: 0, failed: 0, done: true });
    for (let i = 0; i < 5; i++) expect((await habitData(`u${i}`, "h")).currentStreak).toBe(0);
  });

  it("reports done when everything fits in the budget", async () => {
    await seedDueUser("u");
    expect(await runRollover(NOW, { pageSize: 2, deadline: Date.now() + 60_000 })).toMatchObject({ done: true });
  });
});
