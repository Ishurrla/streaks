import { addDays, localDate, weekdayOf } from "@streaks/core";
import { adminDb, checkInIds, clearFirestore, seedHabit, signUpUser, type TestUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as checkIn } from "@/app/api/check-in/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as undoCheckIn } from "@/app/api/undo-check-in/route";
import { POST as updateHabitDays } from "@/app/api/update-habit-days/route";
import { post } from "./helpers";

// These call the routes with the real clock, so dates are worked out from "now" in Lagos,
// the default timezone ensure-profile gives a new user.
const today = () => localDate(new Date(), "Africa/Lagos");
/** A single weekday that is neither today nor tomorrow, so the test holds across midnight. */
const restingDays = () => [(weekdayOf(today()) + 3) % 7];

beforeEach(async () => {
  await clearFirestore();
});

async function userWithProfile(): Promise<TestUser> {
  const user = await signUpUser();
  expect((await post(ensureProfile, {}, { token: user.idToken })).status).toBe(200);
  return user;
}

const habitData = async (uid: string, id: string) => (await adminDb().doc(`users/${uid}/habits/${id}`).get()).data()!;

describe("POST /api/check-in on a rest day", () => {
  it("is refused with NOT_SCHEDULED in the usual error format, and writes nothing", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1", [], [], { days: restingDays() });

    const res = await post(checkIn, { habitId: "h1" }, { token: user.idToken });

    expect(res.status).toBe(409);
    expect(res.json).toEqual({ error: { code: "NOT_SCHEDULED", message: expect.stringContaining("Your streak is safe.") } });
    expect(await checkInIds(user.uid, "h1")).toEqual([]);
  });
});

describe("milestones through the routes", () => {
  it("check-in returns milestoneReached, and undo takes it back", async () => {
    const user = await userWithProfile();
    const t = today();
    await seedHabit(user.uid, "h1", [addDays(t, -2), addDays(t, -1)]);

    const first = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ currentStreak: 3, bestStreak: 3, milestoneReached: 3 });
    expect((await habitData(user.uid, "h1")).milestonesEarned).toEqual([3]);

    const undo = await post(undoCheckIn, { habitId: "h1" }, { token: user.idToken });
    expect(undo.json).toMatchObject({ changed: true, currentStreak: 2, bestStreak: 2, milestoneReached: null });
    expect(await habitData(user.uid, "h1")).toMatchObject({ currentStreak: 2, bestStreak: 2, milestonesEarned: [] });

    // A second check-in the same day is a no-op and celebrates nothing.
    await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    const again = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(again.json).toMatchObject({ changed: false, milestoneReached: null });
  });
});

describe("POST /api/update-habit-days", () => {
  it("stores the change to start tomorrow, leaving today as it was", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1");
    const days = restingDays();

    const res = await post(updateHabitDays, { habitId: "h1", days }, { token: user.idToken });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ days: [0, 1, 2, 3, 4, 5, 6], nextDays: days, nextDaysFrom: addDays(today(), 1), pastDays: [] });
    expect(await habitData(user.uid, "h1")).toMatchObject({ nextDays: days, nextDaysFrom: addDays(today(), 1) });
    // Today is still scheduled under the old days, so checking in works.
    expect((await post(checkIn, { habitId: "h1" }, { token: user.idToken })).status).toBe(200);
  });

  it("cancels a pending change when the days go back to the current ones", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1");
    await post(updateHabitDays, { habitId: "h1", days: [5, 6] }, { token: user.idToken });

    const res = await post(updateHabitDays, { habitId: "h1", days: [6, 5, 4, 3, 2, 1, 0] }, { token: user.idToken });

    expect(res.json).toMatchObject({ nextDays: null, nextDaysFrom: null });
  });

  it("400s unless days is 1 to 7 different whole numbers from 0 to 6", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1");
    for (const days of [undefined, [], [7], [-1], [1.5], [2, 2], ["1"], "0,1", [0, 1, 2, 3, 4, 5, 6, 0]]) {
      const res = await post(updateHabitDays, { habitId: "h1", days }, { token: user.idToken });
      expect(res.status, JSON.stringify(days)).toBe(400);
      expect(res.json.error.code).toBe("invalid-argument");
    }
    for (const body of [{ days: [1] }, { habitId: "", days: [1] }, { habitId: "a/b", days: [1] }]) {
      expect((await post(updateHabitDays, body, { token: user.idToken })).status, JSON.stringify(body)).toBe(400);
    }
    expect((await habitData(user.uid, "h1")).nextDays).toBeUndefined();
  });

  it("401s without a valid ID token", async () => {
    expect((await post(updateHabitDays, { habitId: "h1", days: [1] }, { token: null })).status).toBe(401);
    expect((await post(updateHabitDays, { habitId: "h1", days: [1] }, { token: "not-a-token" })).status).toBe(401);
  });

  it("user B cannot change user A's habit, even naming A's uid in the body", async () => {
    const a = await userWithProfile();
    await seedHabit(a.uid, "h1");
    const b = await userWithProfile();

    for (const body of [{ habitId: "h1", days: [5, 6] }, { habitId: "h1", days: [5, 6], uid: a.uid }]) {
      const res = await post(updateHabitDays, body, { token: b.idToken });
      expect(res.status).toBe(404);
    }
    expect((await habitData(a.uid, "h1")).nextDays).toBeUndefined();
  });
});
