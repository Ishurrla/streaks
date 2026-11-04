import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { checkInFor, undoCheckInFor } from "../src/checkins";
import { CoreError } from "../src/errors";
import { rolloverUser } from "../src/rollover";
import { streaksFor } from "../src/checkins";
import { adminDb, clearFirestore, seedHabit, seedUser } from "../src/testing";

// October 2026: Mon 26, Tue 27, Wed 28, Thu 29, Fri 30, Sat 31. Lagos is UTC+1.
/** `hour` o'clock on `localDay` in Lagos. */
const at = (localDay: string, hour = 10) => new Date(new Date(`${localDay}T00:00:00Z`).getTime() + (hour - 1) * 3_600_000);
const MWF = [0, 2, 4];

const habitData = async (id: string) => (await adminDb().doc(`users/u/habits/${id}`).get()).data()!;
const freezeIds = async (id: string) =>
  (await adminDb().collection(`users/u/habits/${id}/freezeUses`).get()).docs.map((d) => d.id).sort();

/** A Lagos user whose day before `localDay` has ended and not been closed yet. */
async function seedDue(localDay: string, fields: Record<string, unknown> = {}) {
  const [y, m, d] = localDay.split("-").map(Number) as [number, number, number];
  const lastClosed = new Date(Date.UTC(y, m - 1, d - 2)).toISOString().slice(0, 10);
  await seedUser("u", { nextRolloverAt: Timestamp.fromDate(at(localDay, 0)), lastClosedDate: lastClosed, ...fields });
}

async function seedWithStats(id: string, checkIns: string[], asOf: string, fields: Record<string, unknown> = {}) {
  const ref = await seedHabit("u", id, checkIns, [], fields);
  await ref.update({ ...streaksFor(fields, checkIns, [], asOf) });
  return ref;
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof CoreError ? e.code : String(e);
  }
  return "no error";
}

beforeEach(async () => {
  await clearFirestore();
});

describe("check-in on a schedule", () => {
  it("rejects a rest day with NOT_SCHEDULED and writes nothing", async () => {
    await seedUser("u");
    await seedHabit("u", "h", [], [], { days: MWF });

    expect(await codeOf(checkInFor("u", "h", at("2026-10-27")))).toBe("NOT_SCHEDULED");
    expect((await adminDb().collection("users/u/habits/h/checkIns").get()).size).toBe(0);
    expect((await checkInFor("u", "h", at("2026-10-28"))).changed).toBe(true);
  });

  it("works out the weekday in the user's time zone", async () => {
    // Sunday 1 Nov 22:00Z is Monday 2 Nov in Tokyo: a Mon/Wed/Fri habit is due there.
    await seedUser("u", { timezone: "Asia/Tokyo" });
    await seedHabit("u", "h", [], [], { days: MWF });
    expect((await checkInFor("u", "h", new Date("2026-11-01T22:00:00Z"))).date).toBe("2026-11-02");

    await seedUser("u", { timezone: "UTC" });
    await seedHabit("u", "h2", [], [], { days: MWF });
    expect(await codeOf(checkInFor("u", "h2", new Date("2026-11-01T22:00:00Z")))).toBe("NOT_SCHEDULED");
  });

  it("counts only scheduled days in the streak", async () => {
    await seedUser("u");
    await seedHabit("u", "h", ["2026-10-23", "2026-10-26"], [], { days: MWF });
    const res = await checkInFor("u", "h", at("2026-10-28"));
    expect(res).toMatchObject({ currentStreak: 3, bestStreak: 3, milestoneReached: 3 });
  });

  it("applies a day change that has started", async () => {
    await seedUser("u");
    await seedHabit("u", "h", [], [], { days: [0, 1, 2, 3, 4, 5, 6], nextDays: MWF, nextDaysFrom: "2026-10-27" });
    await checkInFor("u", "h", at("2026-10-28"));
    expect(await habitData("h")).toMatchObject({
      days: MWF,
      nextDays: null,
      nextDaysFrom: null,
      pastDays: [{ until: "2026-10-26", days: [0, 1, 2, 3, 4, 5, 6] }],
    });
  });
});

describe("rollover on a schedule", () => {
  it("leaves a streak alone over a rest day and does not use a freeze", async () => {
    // Closing Tuesday 27th, a rest day for Mon/Wed/Fri.
    await seedDue("2026-10-28");
    await seedWithStats("h", ["2026-10-23", "2026-10-26"], "2026-10-27", { days: MWF });

    expect(await rolloverUser("u", at("2026-10-28", 0))).toBe(true);

    expect(await freezeIds("h")).toEqual([]);
    expect((await adminDb().doc("users/u").get()).get("freezesAvailable")).toBe(1);
    expect(await habitData("h")).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });

  it("spends a freeze on a missed scheduled day whose previous scheduled day was done", async () => {
    // Closing Wednesday 28th (missed); Monday 26th was done, Tuesday rests.
    await seedDue("2026-10-29");
    await seedWithStats("h", ["2026-10-23", "2026-10-26"], "2026-10-28", { days: MWF });

    await rolloverUser("u", at("2026-10-29", 0));

    expect(await freezeIds("h")).toEqual(["2026-10-28"]);
    expect(await habitData("h")).toMatchObject({ currentStreak: 3 });
  });

  it("closes each missed day in order when it runs late, skipping rest days", async () => {
    // Last closed Mon 26; runs on Sat 31. Tue 27 and Thu 29 rest; Wed 28 is frozen, Fri 30 breaks it.
    await seedUser("u", { nextRolloverAt: Timestamp.fromDate(at("2026-10-27", 0)), lastClosedDate: "2026-10-26" });
    await seedWithStats("h", ["2026-10-23", "2026-10-26"], "2026-10-27", { days: MWF });

    await rolloverUser("u", at("2026-10-31"));

    expect(await freezeIds("h")).toEqual(["2026-10-28"]);
    expect(await habitData("h")).toMatchObject({ currentStreak: 0, bestStreak: 3 });
  });

  it("makes a pending day change current once its date arrives", async () => {
    await seedDue("2026-10-29");
    await seedHabit("u", "h", [], [], { nextDays: [5, 6], nextDaysFrom: "2026-10-29" });

    await rolloverUser("u", at("2026-10-29", 0));

    expect(await habitData("h")).toMatchObject({
      days: [5, 6],
      nextDays: null,
      nextDaysFrom: null,
      pastDays: [{ until: "2026-10-28", days: [0, 1, 2, 3, 4, 5, 6] }],
    });
  });

  it("backfills milestones for an existing habit, from its best streak", async () => {
    await seedDue("2026-10-29");
    const ref = await seedHabit("u", "h", [], [], { milestonesEarned: undefined });
    await ref.update({ bestStreak: 9 });

    await rolloverUser("u", at("2026-10-29", 0));

    expect((await habitData("h")).milestonesEarned).toEqual([3, 7]);
  });
});

describe("milestones", () => {
  const days = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);

  it("are earned on the check-in that first reaches them", async () => {
    await seedUser("u");
    await seedWithStats("h", days(22, 27), "2026-10-27"); // a 6-day streak

    const res = await checkInFor("u", "h", at("2026-10-28"));

    expect(res).toMatchObject({ currentStreak: 7, milestoneReached: 7 });
    expect((await habitData("h")).milestonesEarned).toEqual([3, 7]);
    const doc = (await adminDb().doc("users/u/habits/h/checkIns/2026-10-28").get()).data()!;
    expect(doc.milestonesAdded).toEqual([3, 7]);
  });

  it("are not celebrated again after a reset", async () => {
    await seedUser("u");
    // An old 7-day run, then a reset, then 6 days again: already holds 3 and 7.
    await seedWithStats("h", [...days(1, 7), ...days(22, 27)], "2026-10-27", { milestonesEarned: [3, 7] });

    const res = await checkInFor("u", "h", at("2026-10-28"));

    expect(res).toMatchObject({ currentStreak: 7, bestStreak: 7, milestoneReached: null });
    expect((await habitData("h")).milestonesEarned).toEqual([3, 7]);
  });

  it("are not earned on an existing habit whose best streak already passed them", async () => {
    await seedUser("u");
    await seedWithStats("h", [...days(1, 10), ...days(26, 27)], "2026-10-27", { milestonesEarned: undefined });

    const res = await checkInFor("u", "h", at("2026-10-28"));

    expect(res.milestoneReached).toBeNull();
    expect((await habitData("h")).milestonesEarned).toEqual([3, 7]);
  });

  it("are taken back by undoing the check-in that earned them, restoring every stat", async () => {
    await seedUser("u");
    await seedWithStats("h", days(22, 27), "2026-10-27", { milestonesEarned: [3] });
    const before = await habitData("h");

    await checkInFor("u", "h", at("2026-10-28"));
    expect((await habitData("h")).bestStreak).toBe(7);
    await undoCheckInFor("u", "h", at("2026-10-28", 11));

    const after = await habitData("h");
    expect(after).toMatchObject({
      currentStreak: before.currentStreak,
      bestStreak: before.bestStreak,
      lastCheckInDate: before.lastCheckInDate,
      milestonesEarned: [3],
    });

    // And checking in again earns it again, since it was taken back.
    expect((await checkInFor("u", "h", at("2026-10-28", 12))).milestoneReached).toBe(7);
  });
});
