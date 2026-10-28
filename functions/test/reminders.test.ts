import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reminderText, runReminders, type Sender } from "../src/reminders";
import { adminDb, clearFirestore, disposeClients, seedHabit, seedUser } from "./helpers";

// 19:30 UTC = 20:30 in Lagos (UTC+1), past the default 20:00 reminder time.
const NOW = new Date("2026-10-28T19:30:00Z");
const BEFORE_TIME = new Date("2026-10-28T18:30:00Z"); // 19:30 in Lagos
const NEXT_DAY = new Date("2026-10-29T19:30:00Z");

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
  await seedUser(uid, {
    reminderEnabled: true,
    reminderTime: "20:00",
    lastReminderDate: null,
    lastClosedDate: "2026-10-27",
    ...fields,
  });
  const db = adminDb();
  await Promise.all(
    tokens.map((t, i) => db.doc(`users/${uid}/pushTokens/t${i}`).set({ token: t, userAgent: "test", createdAt: new Date() })),
  );
}

async function seedHabitState(uid: string, id: string, currentStreak: number, lastCheckInDate: string | null) {
  const ref = await seedHabit(uid, id);
  await ref.update({ currentStreak, bestStreak: currentStreak, lastCheckInDate });
}

const userData = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).data()!;
const tokenIds = async (uid: string) =>
  (await adminDb().collection(`users/${uid}/pushTokens`).get()).docs.map((d) => d.get("token")).sort();

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await disposeClients();
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
      failed: 0,
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

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 1, failed: 0 });
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

    expect(await runReminders(NOW, sender)).toEqual({ sent: 0, skipped: 2, failed: 0 });
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

    expect(await runReminders(NOW, sender, { pageSize: 1 })).toEqual({ sent: 1, skipped: 0, failed: 1 });

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
});
