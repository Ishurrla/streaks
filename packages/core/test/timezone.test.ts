import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { checkInFor } from "../src/checkins";
import { computeStreaks } from "../src/streaks";
import { updateTimezoneFor } from "../src/timezone";
import { adminDb, checkInIds, clearFirestore, seedHabit, seedUser } from "../src/testing";

// Lagos is UTC+1 all year. Its midnight starting 29 Oct 2026 is 23:00Z on the 28th.
const LAGOS_MIDNIGHT_29 = new Date("2026-10-28T23:00:00Z");
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

beforeEach(async () => {
  await clearFirestore();
});

describe("updateTimezone", () => {
  it("changes the timezone, moves nextRolloverAt and recomputes stats", async () => {
    await seedUser("u", { nextRolloverAt: ts(LAGOS_MIDNIGHT_29), lastClosedDate: "2026-10-27" });
    await seedHabitWithStats("u", "h", ["2026-10-27", "2026-10-28"]);
    // 22:30Z on the 28th: 23:30 in Lagos, but already 07:30 on the 29th in Tokyo.
    const now = new Date("2026-10-28T22:30:00Z");

    const res = await updateTimezoneFor("u", "Asia/Tokyo", now);

    expect(res).toEqual({ timezone: "Asia/Tokyo", today: "2026-10-29", nextRolloverAt: "2026-10-29T15:00:00.000Z" });
    const user = await userData("u");
    expect(user.timezone).toBe("Asia/Tokyo");
    expect(user.nextRolloverAt.toDate()).toEqual(new Date("2026-10-29T15:00:00Z"));
    // In Tokyo the 28th is now yesterday, so the streak is still alive but at risk.
    expect(await habitData("u", "h")).toMatchObject({ currentStreak: 2 });
  });

  it("rejects an unknown timezone and leaves the profile alone", async () => {
    await seedUser("u", { nextRolloverAt: ts(LAGOS_MIDNIGHT_29) });
    const before = await userData("u");
    await expect(updateTimezoneFor("u", "Mars/Olympus", NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(updateTimezoneFor("u", 123, NOW)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(await userData("u")).toEqual(before);
  });

  it("closes an overdue day first, so moving west cannot reopen it", async () => {
    // 00:05 on the 29th in Lagos, rollover has not run yet, and the 28th was missed.
    await seedDueUser("u", { freezesAvailable: 0 });
    await seedHabitWithStats("u", "h", ["2026-10-27"]);

    // In Los Angeles it is still 16:05 on the 28th.
    await updateTimezoneFor("u", "America/Los_Angeles", NOW);

    const user = await userData("u");
    expect(user.lastClosedDate).toBe("2026-10-28");
    expect(user.nextRolloverAt.toDate()).toEqual(new Date("2026-10-29T07:00:00Z"));
    await expect(checkInFor("u", "h", NOW)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(await checkInIds("u", "h")).toEqual(["2026-10-27"]);
    expect((await habitData("u", "h")).currentStreak).toBe(0);
  });
});
