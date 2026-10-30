import { addDays, computeStreaks, localDate, nextLocalMidnight } from "@streaks/core";
import { adminDb, clearFirestore, seedHabit, signUpUser, type TestUser } from "@streaks/core/testing";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as checkIn } from "@/app/api/check-in/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as syncReminders } from "@/app/api/sync-reminders/route";
import { post } from "./helpers";

const TZ = "Africa/Lagos";

beforeEach(async () => {
  await clearFirestore();
});

/**
 * A user whose yesterday ended without the cron running: nextRolloverAt is the last local
 * midnight, the last closed day is the day before yesterday, and habit h1 was done for the
 * three days up to the day before yesterday but not yesterday. Its stored stats are still
 * the ones from yesterday, when the streak was alive (at risk).
 */
async function userTheCronMissed(freezesAvailable: number): Promise<TestUser & { today: string }> {
  const user = await signUpUser();
  expect((await post(ensureProfile, {}, { token: user.idToken })).status).toBe(200);

  const now = new Date();
  const today = localDate(now, TZ);
  const yesterday = addDays(today, -1);
  const done = [addDays(today, -4), addDays(today, -3), addDays(today, -2)];
  const lastMidnight = nextLocalMidnight(new Date(now.getTime() - 86_400_000), TZ);

  await adminDb().doc(`users/${user.uid}`).update({
    nextRolloverAt: Timestamp.fromDate(lastMidnight),
    lastClosedDate: addDays(today, -2),
    freezesAvailable,
  });
  const habit = await seedHabit(user.uid, "h1", done);
  await habit.update({ ...computeStreaks(done, [], yesterday) }); // currentStreak 3, as of yesterday
  return { ...user, today };
}

const userData = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).data()!;
const habitData = async (uid: string) => (await adminDb().doc(`users/${uid}/habits/h1`).get()).data()!;

describe("lazy catch-up when the cron has not run", () => {
  it("ensure-profile (every app start) breaks the missed streak and closes yesterday", async () => {
    const user = await userTheCronMissed(0);
    expect((await habitData(user.uid)).currentStreak).toBe(3); // stale: yesterday was missed

    const res = await post(ensureProfile, {}, { token: user.idToken });
    expect(res.json).toEqual({ created: false });

    expect((await habitData(user.uid)).currentStreak).toBe(0);
    const profile = await userData(user.uid);
    expect(profile.lastClosedDate).toBe(addDays(user.today, -1));
    expect(profile.nextRolloverAt.toMillis()).toBeGreaterThan(Date.now());
  });

  it("check-in rolls over first, so a freeze covers yesterday and the streak carries on", async () => {
    const user = await userTheCronMissed(1);

    const res = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(res.status).toBe(200);
    // Three days, yesterday covered by the freeze, then today. Without the catch-up the
    // freeze would never be spent and the streak would restart at 1.
    expect(res.json).toMatchObject({ date: user.today, currentStreak: 5 });
    const profile = await userData(user.uid);
    expect(profile.freezesAvailable).toBe(0);
    expect(profile.lastClosedDate).toBe(addDays(user.today, -1));
    const freezes = await adminDb().collection(`users/${user.uid}/habits/h1/freezeUses`).get();
    expect(freezes.docs.map((d) => d.id)).toEqual([addDays(user.today, -1)]);
  });

  it("changes nothing when the cron is up to date", async () => {
    const user = await signUpUser();
    await post(ensureProfile, {}, { token: user.idToken });
    const before = await userData(user.uid);
    await post(ensureProfile, {}, { token: user.idToken });
    expect(await userData(user.uid)).toEqual(before);
  });
});

describe("POST /api/sync-reminders", () => {
  it("schedules the next reminder after the client turns reminders on, and clears it when off", async () => {
    const user = await signUpUser();
    await post(ensureProfile, {}, { token: user.idToken });
    expect((await userData(user.uid)).nextReminderAt).toBeNull();

    // The client writes the settings directly (the rules allow it), then calls the route.
    await adminDb().doc(`users/${user.uid}`).update({ reminderEnabled: true, reminderTime: "23:59" });
    const on = await post(syncReminders, {}, { token: user.idToken });
    expect(on.status).toBe(200);
    expect(typeof on.json.nextReminderAt).toBe("string");
    expect((await userData(user.uid)).nextReminderAt.toDate().toISOString()).toBe(on.json.nextReminderAt);

    await adminDb().doc(`users/${user.uid}`).update({ reminderEnabled: false });
    expect((await post(syncReminders, {}, { token: user.idToken })).json).toEqual({ nextReminderAt: null });
    expect((await userData(user.uid)).nextReminderAt).toBeNull();
  });

  it("only touches the token's user, never a uid from the body", async () => {
    const a = await signUpUser();
    await post(ensureProfile, {}, { token: a.idToken });
    await adminDb().doc(`users/${a.uid}`).update({ reminderEnabled: true });
    const b = await signUpUser();
    await post(ensureProfile, {}, { token: b.idToken });

    await post(syncReminders, { uid: a.uid }, { token: b.idToken });
    expect((await userData(a.uid)).nextReminderAt).toBeNull();
  });
});
