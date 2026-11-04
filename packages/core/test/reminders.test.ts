import { Timestamp } from "firebase-admin/firestore";
import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { beforeEach, describe, expect, it } from "vitest";
import { nextReminderAt, reminderText, runReminders, syncReminderSchedule, type Sender } from "../src/reminders";
import { adminDb, clearFirestore, seedHabit, seedUser } from "../src/testing";

// 19:30 UTC = 20:30 in Lagos (UTC+1), past the default 20:00 reminder time.
const NOW = new Date("2026-10-28T19:30:00Z");
const BEFORE_TIME = new Date("2026-10-28T18:30:00Z"); // 19:30 in Lagos
const NEXT_DAY = new Date("2026-10-29T19:30:00Z");
// When the seeded users "turned reminders on": early on the 28th (UTC), so each user's
// nextReminderAt is their reminder time that local day, as the server would have set it.
const CONFIGURED = new Date("2026-10-28T05:00:00Z");

/** Records every message; fails the tokens listed in `failures` with the given code. */
function fakeSender(failures: Record<string, string> = {}, opts: { throws?: Set<string> } = {}) {
  const sent: MulticastMessage[] = [];
  const sender: Sender = {
    async sendEachForMulticast(message) {
      if (message.tokens.some((t) => opts.throws?.has(t))) throw new Error("FCM is down");
      sent.push(message);
      const responses = message.tokens.map((t) =>
        failures[t]
          ? { success: false as const, error: { code: failures[t]!, message: "nope" } as never }
          : { success: true as const, messageId: `m-${t}` },
      );
      return {
        responses,
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
      } as BatchResponse;
    },
  };
  return { sender, sent };
}

async function seedReminderUser(uid: string, fields: Record<string, unknown> = {}, tokens = ["tok-a"]) {
  const settings = {
    timezone: "Africa/Lagos",
    reminderEnabled: true,
    reminderTime: "20:00",
    lastReminderDate: null,
    lastClosedDate: "2026-10-27",
    ...fields,
  } as Parameters<typeof nextReminderAt>[1] & Record<string, unknown>;
  const due = nextReminderAt(CONFIGURED, settings);
  await seedUser(uid, { ...settings, nextReminderAt: due ? Timestamp.fromDate(due) : null });
  const db = adminDb();
  await Promise.all(
    tokens.map((t, i) => db.doc(`users/${uid}/pushTokens/t${i}`).set({ token: t, userAgent: "test", createdAt: new Date() })),
  );
}

async function seedHabitState(
  uid: string,
  id: string,
  currentStreak: number,
  lastCheckInDate: string | null,
  fields: Record<string, unknown> = {},
) {
  const ref = await seedHabit(uid, id, [], [], fields);
  await ref.update({ currentStreak, bestStreak: currentStreak, lastCheckInDate });
}

const userData = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).data()!;
const tokenIds = async (uid: string) =>
  (await adminDb().collection(`users/${uid}/pushTokens`).get()).docs.map((d) => d.get("token")).sort();

beforeEach(async () => {
  await clearFirestore();
});

describe("reminderText", () => {
  it("counts what is left and names the streak at risk", () => {
    expect(reminderText(3, 12)).toBe("3 habits left today. Keep your 12 day streak alive.");
    expect(reminderText(1, 0)).toBe("1 habit left today. Check one off to start a streak.");
  });
});

describe("runReminders", () => {
  it("sends one notification to each of the user's devices and records the day", async () => {
    await seedReminderUser("u", {}, ["tok-phone", "tok-laptop"]);
    await seedHabitState("u", "read", 12, "2026-10-27"); // at risk
    await seedHabitState("u", "walk", 0, null);
    await seedHabitState("u", "water", 3, "2026-10-28"); // done today
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender, { appUrl: "https://streaks.example/" })).toEqual({
      sent: 1,
      skipped: 0,
      failed: 0, done: true
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.tokens.sort()).toEqual(["tok-laptop", "tok-phone"]);
    expect(sent[0]!.notification).toEqual({
      title: "Streaks",
      body: "2 habits left today. Keep your 12 day streak alive.",
    });
    expect(sent[0]!.webpush?.fcmOptions?.link).toBe("https://streaks.example/today");
    expect((await userData("u")).lastReminderDate).toBe("2026-10-28");
  });

  it("sends once per day, then again the next day", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "read", 2, "2026-10-27");
    const { sender, sent } = fakeSender();

    await runReminders(NOW, sender);
    await runReminders(new Date(NOW.getTime() + 15 * 60_000), sender);
    expect(sent).toHaveLength(1);

    await runReminders(NEXT_DAY, sender);
    expect(sent).toHaveLength(2);
    expect((await userData("u")).lastReminderDate).toBe("2026-10-29");
  });

  it("sends only once when runs overlap", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "read", 2, "2026-10-27");
    const { sender, sent } = fakeSender();

    await Promise.all([runReminders(NOW, sender), runReminders(NOW, sender), runReminders(NOW, sender)]);

    expect(sent).toHaveLength(1);
  });

  it("skips users who have done everything today", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "read", 5, "2026-10-28");
    await seedHabitState("u", "walk", 1, "2026-10-28");
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 1, failed: 0, done: true });
    expect(sent).toHaveLength(0);
    expect((await userData("u")).lastReminderDate).toBeNull();
  });

  it("respects each user's local time", async () => {
    // Same instant: 19:30 in Lagos (before 20:00), 03:30 next day in Tokyo, 11:30 in Los Angeles.
    await seedReminderUser("lagos", {}, ["tok-lagos"]);
    await seedReminderUser("tokyo", { timezone: "Asia/Tokyo" }, ["tok-tokyo"]);
    await seedReminderUser("la", { timezone: "America/Los_Angeles", reminderTime: "11:00" }, ["tok-la"]);
    for (const uid of ["lagos", "tokyo", "la"]) await seedHabitState(uid, "h", 0, null);
    const { sender, sent } = fakeSender();

    await runReminders(BEFORE_TIME, sender);

    expect(sent.map((m) => m.tokens[0])).toEqual(["tok-la"]);
    expect((await userData("la")).lastReminderDate).toBe("2026-10-28");
    expect((await userData("lagos")).lastReminderDate).toBeNull();
    expect((await userData("tokyo")).lastReminderDate).toBeNull();
  });

  it("skips users with reminders off, no devices or no habits", async () => {
    await seedReminderUser("off", { reminderEnabled: false });
    await seedHabitState("off", "h", 0, null);
    await seedReminderUser("nodevice", {}, []);
    await seedHabitState("nodevice", "h", 0, null);
    await seedReminderUser("nohabits");
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 2, failed: 0, done: true });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing on a day when every unchecked habit is resting, and looks again tomorrow", async () => {
    // The 28th is a Wednesday. Weekend-only and Mon/Fri habits rest; the daily one is done.
    await seedReminderUser("u");
    await seedHabitState("u", "weekend", 4, "2026-10-25", { days: [5, 6] });
    await seedHabitState("u", "monfri", 2, "2026-10-26", { days: [0, 4] });
    await seedHabitState("u", "daily", 5, "2026-10-28");
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 1, failed: 0, done: true });
    expect(sent).toHaveLength(0);
    const user = await userData("u");
    expect(user.lastReminderDate).toBeNull();
    expect(user.nextReminderAt.toDate()).toEqual(new Date("2026-10-29T19:00:00Z"));
  });

  it("counts only the habits due today", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "weekend", 20, "2026-10-25", { days: [5, 6] }); // resting, not counted
    await seedHabitState("u", "wed", 3, "2026-10-21", { days: [2] }); // due today
    const { sender, sent } = fakeSender();

    await runReminders(NOW, sender);

    expect(sent[0]!.notification?.body).toBe("1 habit left today. Keep your 3 day streak alive.");
  });

  it("follows a pending day change only from its start date", async () => {
    // Changed yesterday to weekends from today: resting today, so no reminder.
    await seedReminderUser("u");
    await seedHabitState("u", "h", 1, "2026-10-27", { nextDays: [5, 6], nextDaysFrom: "2026-10-28" });
    const { sender, sent } = fakeSender();

    await runReminders(NOW, sender);
    expect(sent).toHaveLength(0);
  });

  it("removes tokens FCM reports as unregistered or invalid, and keeps the rest", async () => {
    await seedReminderUser("u", {}, ["tok-ok", "tok-gone", "tok-bad", "tok-flaky"]);
    await seedHabitState("u", "h", 0, null);
    const { sender } = fakeSender({
      "tok-gone": "messaging/registration-token-not-registered",
      "tok-bad": "messaging/invalid-registration-token",
      "tok-flaky": "messaging/internal-error",
    });

    await runReminders(NOW, sender);

    expect(await tokenIds("u")).toEqual(["tok-flaky", "tok-ok"]);
  });

  it("releases the day when sending fails, and carries on with other users", async () => {
    await seedReminderUser("broken", {}, ["tok-broken"]);
    await seedReminderUser("fine", {}, ["tok-fine"]);
    for (const uid of ["broken", "fine"]) await seedHabitState(uid, "h", 0, null);
    const { sender, sent } = fakeSender({}, { throws: new Set(["tok-broken"]) });

    expect(await runReminders(NOW, sender, { pageSize: 1 })).toEqual({ sent: 1, skipped: 0, failed: 1, done: true });

    expect(sent.map((m) => m.tokens[0])).toEqual(["tok-fine"]);
    expect((await userData("broken")).lastReminderDate).toBeNull(); // retried next run
    expect((await userData("fine")).lastReminderDate).toBe("2026-10-28");
  });

  it("does not remind about a day that has already closed", async () => {
    await seedReminderUser("u", { lastClosedDate: "2026-10-28" });
    await seedHabitState("u", "h", 4, "2026-10-27");
    const { sender, sent } = fakeSender();

    await runReminders(NOW, sender);

    expect(sent).toHaveLength(0);
  });

  it("moves nextReminderAt to tomorrow's reminder time after sending", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "read", 2, "2026-10-27");
    await runReminders(NOW, fakeSender().sender);
    // 20:00 on the 29th in Lagos.
    expect((await userData("u")).nextReminderAt.toDate()).toEqual(new Date("2026-10-29T19:00:00Z"));
  });

  it("only reads users whose nextReminderAt has passed", async () => {
    await seedReminderUser("later", { reminderTime: "22:00" }); // due 21:00Z, after NOW
    await seedReminderUser("off", { reminderEnabled: false });
    await seedHabitState("later", "h", 0, null);
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 0, failed: 0, done: true });
    expect(sent).toHaveLength(0);
  });

  it("does not look at a user with nothing to do again until tomorrow", async () => {
    await seedReminderUser("u");
    await seedHabitState("u", "read", 5, "2026-10-28");
    const { sender } = fakeSender();

    expect(await runReminders(NOW, sender)).toMatchObject({ skipped: 1 });
    expect((await userData("u")).nextReminderAt.toDate()).toEqual(new Date("2026-10-29T19:00:00Z"));
    // Fifteen minutes later the user is not even read.
    expect(await runReminders(new Date(NOW.getTime() + 15 * 60_000), sender)).toMatchObject({ skipped: 0, sent: 0 });
  });

  it("respects a reminder time the client changed after it was scheduled", async () => {
    await seedReminderUser("u"); // scheduled for 20:00
    await seedHabitState("u", "read", 2, "2026-10-27");
    await adminDb().doc("users/u").update({ reminderTime: "22:00" }); // changed, schedule not synced
    const { sender, sent } = fakeSender();

    await runReminders(NOW, sender); // 20:30 in Lagos: too early now
    expect(sent).toHaveLength(0);
    expect((await userData("u")).nextReminderAt.toDate()).toEqual(new Date("2026-10-28T21:00:00Z"));

    await runReminders(new Date("2026-10-28T21:05:00Z"), sender); // 22:05 in Lagos
    expect(sent).toHaveLength(1);
  });

  it("keeps a user due when sending fails, so the next run retries", async () => {
    await seedReminderUser("u", {}, ["tok-broken"]);
    await seedHabitState("u", "h", 0, null);
    const before = (await userData("u")).nextReminderAt.toDate();
    const { sender } = fakeSender({}, { throws: new Set(["tok-broken"]) });

    expect(await runReminders(NOW, sender)).toMatchObject({ failed: 1 });
    expect((await userData("u")).nextReminderAt.toDate()).toEqual(before);
  });

  it("stops starting new pages after the deadline, and the next run finishes the rest", async () => {
    for (let i = 0; i < 5; i++) {
      await seedReminderUser(`u${i}`, {}, [`tok-${i}`]);
      await seedHabitState(`u${i}`, "h", 0, null);
    }
    const { sender, sent } = fakeSender();

    expect(await runReminders(NOW, sender, { pageSize: 2, deadline: 0 })).toEqual({
      sent: 2,
      skipped: 0,
      failed: 0,
      done: false,
    });
    expect(await runReminders(NOW, sender, { pageSize: 2 })).toEqual({ sent: 3, skipped: 0, failed: 0, done: true });
    expect(sent).toHaveLength(5);
  });
});

describe("syncReminderSchedule", () => {
  it("sets today's reminder time when reminders are on, and null when off", async () => {
    await seedUser("u", { reminderEnabled: true, reminderTime: "21:15", nextReminderAt: null });
    expect(await syncReminderSchedule("u", NOW)).toEqual({ nextReminderAt: "2026-10-28T20:15:00.000Z" });
    expect((await userData("u")).nextReminderAt.toDate()).toEqual(new Date("2026-10-28T20:15:00Z"));

    await adminDb().doc("users/u").update({ reminderEnabled: false });
    expect(await syncReminderSchedule("u", NOW)).toEqual({ nextReminderAt: null });
    expect((await userData("u")).nextReminderAt).toBeNull();
  });

  it("schedules tomorrow once today's reminder has been sent", async () => {
    await seedUser("u", { reminderEnabled: true, reminderTime: "20:00", lastReminderDate: "2026-10-28" });
    expect(await syncReminderSchedule("u", NOW)).toEqual({ nextReminderAt: "2026-10-29T19:00:00.000Z" });
  });

  it("does nothing for a user without a profile", async () => {
    expect(await syncReminderSchedule("nobody", NOW)).toEqual({ nextReminderAt: null });
    expect((await adminDb().doc("users/nobody").get()).exists).toBe(false);
  });
});
