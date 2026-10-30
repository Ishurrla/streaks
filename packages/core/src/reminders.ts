import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { DateTime } from "luxon";
import { db } from "./admin";
import { log } from "./log";
import { localDate } from "./time";

/** The part of the Admin SDK's Messaging that runReminders needs; tests pass a fake. */
export interface Sender {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

// FCM error codes meaning the token will never work again.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export interface ReminderOptions {
  pageSize?: number;
  /** Absolute app URL for the notification click, e.g. https://streaks.example.com */
  appUrl?: string;
  /** Wall-clock time (ms) after which no new page is started. Unfinished users wait for the next run. */
  deadline?: number;
}

export function reminderText(left: number, topStreak: number): string {
  const habits = left === 1 ? "1 habit left today." : `${left} habits left today.`;
  return topStreak > 0
    ? `${habits} Keep your ${topStreak} day streak alive.`
    : `${habits} Check one off to start a streak.`;
}

/** The fields of users/{uid} that decide when the next reminder is due. */
export interface ReminderSettings {
  timezone: string;
  reminderEnabled?: boolean;
  reminderTime?: string;
  lastReminderDate?: string | null;
  lastClosedDate?: string;
}

function settingsOf(snap: DocumentSnapshot): ReminderSettings {
  return {
    timezone: snap.get("timezone") as string,
    reminderEnabled: snap.get("reminderEnabled") as boolean | undefined,
    reminderTime: snap.get("reminderTime") as string | undefined,
    lastReminderDate: (snap.get("lastReminderDate") as string | null | undefined) ?? null,
    lastClosedDate: snap.get("lastClosedDate") as string | undefined,
  };
}

/**
 * When the next reminder is due, or null with reminders off. That is today's reminder
 * time in the user's timezone, unless today's reminder has been sent or today has
 * already closed, in which case it is tomorrow's. It may be in the past (due now).
 *
 * The reminders job only reads users whose nextReminderAt has passed, so it never
 * scans everyone. The server keeps this field current (clients cannot write it).
 */
export function nextReminderAt(now: Date, user: ReminderSettings, { skipToday = false } = {}): Date | null {
  if (user.reminderEnabled !== true) return null;
  const local = DateTime.fromJSDate(now, { zone: user.timezone });
  if (!local.isValid) throw new Error(`Invalid timezone: ${user.timezone}`);
  const today = local.toISODate()!;
  const [hour, minute] = (user.reminderTime ?? "20:00").split(":").map(Number) as [number, number];

  const todayDone =
    skipToday || user.lastReminderDate === today || (user.lastClosedDate !== undefined && today <= user.lastClosedDate);
  const day = todayDone ? local.startOf("day").plus({ days: 1 }) : local.startOf("day");
  return day.set({ hour, minute }).toJSDate();
}

const sameInstant = (a: unknown, b: Date | null) =>
  b === null ? a === null || a === undefined : a instanceof Timestamp && a.toMillis() === b.getTime();

/**
 * Recomputes users/{uid}.nextReminderAt from the current settings. Called after the
 * client changes reminder settings, on every app start (ensure-profile) and after a
 * timezone change. Writes only when the value changes.
 */
export async function syncReminderSchedule(uid: string, now: Date): Promise<{ nextReminderAt: string | null }> {
  const ref = db().collection("users").doc(uid);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { nextReminderAt: null };
    const next = nextReminderAt(now, settingsOf(snap));
    if (!sameInstant(snap.get("nextReminderAt"), next)) {
      tx.update(ref, { nextReminderAt: next ? Timestamp.fromDate(next) : null });
    }
    return { nextReminderAt: next ? next.toISOString() : null };
  });
}

/** Local "HH:mm" for `now` in `timezone`. */
function localTime(now: Date, timezone: string): string {
  return DateTime.fromJSDate(now, { zone: timezone }).toFormat("HH:mm");
}

type Outcome = "sent" | "skipped";

/**
 * Sends today's reminder to one user if it is due. The day is claimed (lastReminderDate
 * set) in a transaction before sending, so concurrent or repeated runs send at most once
 * a day. If sending fails outright the claim is released so the next run retries.
 * Every outcome leaves nextReminderAt pointing at the next time this user needs a look.
 */
export async function remindUser(uid: string, now: Date, sender: Sender, appUrl?: string): Promise<Outcome> {
  const userRef = db().collection("users").doc(uid);

  const claim = await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) return null;
    const settings = settingsOf(user);
    const reschedule = (opts?: { skipToday: boolean }) => {
      const next = nextReminderAt(now, settings, opts);
      tx.update(userRef, { nextReminderAt: next ? Timestamp.fromDate(next) : null });
      return null;
    };

    if (settings.reminderEnabled !== true) return reschedule();
    const today = localDate(now, settings.timezone);
    if (settings.lastReminderDate === today) return reschedule();
    // Not reminder time yet in the user's zone (e.g. the setting changed since scheduling).
    if (localTime(now, settings.timezone) < (settings.reminderTime ?? "20:00")) return reschedule();
    // A closed day cannot be checked in any more, so there is nothing to nudge about.
    if (settings.lastClosedDate && today <= settings.lastClosedDate) return reschedule();

    const [habits, tokens] = await Promise.all([
      tx.get(userRef.collection("habits")),
      tx.get(userRef.collection("pushTokens")),
    ]);
    // lastCheckInDate is server-owned and kept exact by checkIn, undoCheckIn and rollover.
    const unchecked = habits.docs.filter((h) => h.get("lastCheckInDate") !== today);
    // Nothing to do today: look again tomorrow rather than every 15 minutes.
    if (unchecked.length === 0 || tokens.empty) return reschedule({ skipToday: true });

    const previousNext = user.get("nextReminderAt") as Timestamp | null;
    const next = nextReminderAt(now, { ...settings, lastReminderDate: today });
    tx.update(userRef, { lastReminderDate: today, nextReminderAt: next ? Timestamp.fromDate(next) : null });
    const topStreak = Math.max(0, ...unchecked.map((h) => (h.get("currentStreak") as number) ?? 0));
    return {
      previous: settings.lastReminderDate ?? null,
      previousNext,
      tokens: tokens.docs,
      body: reminderText(unchecked.length, topStreak),
    };
  });
  if (!claim) return "skipped";

  const tokens = claim.tokens.map((d: QueryDocumentSnapshot) => d.get("token") as string);
  let result: BatchResponse;
  try {
    result = await sender.sendEachForMulticast({
      tokens,
      notification: { title: "Streaks", body: claim.body },
      webpush: {
        notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "streaks-reminder" },
        ...(appUrl ? { fcmOptions: { link: `${appUrl.replace(/\/$/, "")}/today` } } : {}),
      },
    });
  } catch (error) {
    // Release the claim: still due, so the next run tries again.
    await userRef.update({ lastReminderDate: claim.previous, nextReminderAt: claim.previousNext });
    throw error;
  }

  const dead = result.responses
    .map((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? claim.tokens[i]! : null))
    .filter((d): d is QueryDocumentSnapshot => d !== null);
  if (dead.length) {
    const batch = db().batch();
    dead.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return "sent";
}

export interface RemindersResult {
  sent: number;
  skipped: number;
  failed: number;
  /** false when the time budget ran out; the rest are picked up by the next run. */
  done: boolean;
}

/**
 * Sends the evening reminder to every user who is due. Only users whose nextReminderAt
 * has passed are read, in pages; each is handled on its own, so one failure does not
 * stop the rest. A failed user keeps their nextReminderAt, so the next run retries them.
 */
export async function runReminders(now: Date, sender: Sender, options: ReminderOptions = {}): Promise<RemindersResult> {
  const { pageSize = 100, appUrl, deadline = Infinity } = options;
  const result: RemindersResult = { sent: 0, skipped: 0, failed: 0, done: false };
  let cursor: QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db()
      .collection("users")
      .where("nextReminderAt", "<=", Timestamp.fromDate(now))
      .orderBy("nextReminderAt")
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();

    const outcomes = await Promise.allSettled(page.docs.map((d) => remindUser(d.id, now, sender, appUrl)));
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") result[o.value]++;
      else {
        result.failed++;
        log.error("Reminder failed for user", { uid: page.docs[i]!.id, error: String(o.reason) });
      }
    });

    if (page.size < pageSize) {
      result.done = true;
      break;
    }
    if (Date.now() >= deadline) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return result;
}

/** Used with the emulators, where FCM is not available: logs the message, reports success. */
export const loggingSender: Sender = {
  async sendEachForMulticast(message) {
    log.info("[emulator] Would send push reminder", {
      tokens: message.tokens.length,
      body: message.notification?.body,
    });
    return {
      successCount: message.tokens.length,
      failureCount: 0,
      responses: message.tokens.map(() => ({ success: true, messageId: "emulator" })),
    };
  },
};
