import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { db } from "./admin";
import { localDate } from "./time";
import { DateTime } from "luxon";

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
}

export function reminderText(left: number, topStreak: number): string {
  const habits = left === 1 ? "1 habit left today." : `${left} habits left today.`;
  return topStreak > 0
    ? `${habits} Keep your ${topStreak} day streak alive.`
    : `${habits} Check one off to start a streak.`;
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
 */
export async function remindUser(uid: string, now: Date, sender: Sender, appUrl?: string): Promise<Outcome> {
  const userRef = db.collection("users").doc(uid);

  const claim = await db.runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists || user.get("reminderEnabled") !== true) return null;

    const timezone = user.get("timezone") as string;
    const today = localDate(now, timezone);
    const previous = (user.get("lastReminderDate") as string | null) ?? null;
    if (previous === today) return null;
    if (localTime(now, timezone) < ((user.get("reminderTime") as string) ?? "20:00")) return null;
    // A closed day cannot be checked in any more, so there is nothing to nudge about.
    const lastClosedDate = user.get("lastClosedDate") as string | undefined;
    if (lastClosedDate && today <= lastClosedDate) return null;

    const [habits, tokens] = await Promise.all([
      tx.get(userRef.collection("habits")),
      tx.get(userRef.collection("pushTokens")),
    ]);
    // lastCheckInDate is server-owned and kept exact by checkIn, undoCheckIn and rollover.
    const unchecked = habits.docs.filter((h) => h.get("lastCheckInDate") !== today);
    if (unchecked.length === 0 || tokens.empty) return null;

    tx.update(userRef, { lastReminderDate: today });
    const topStreak = Math.max(0, ...unchecked.map((h) => (h.get("currentStreak") as number) ?? 0));
    return { previous, tokens: tokens.docs, body: reminderText(unchecked.length, topStreak) };
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
    await userRef.update({ lastReminderDate: claim.previous });
    throw error;
  }

  const dead = result.responses
    .map((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? claim.tokens[i]! : null))
    .filter((d): d is QueryDocumentSnapshot => d !== null);
  if (dead.length) {
    const batch = db.batch();
    dead.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return "sent";
}

export interface RemindersResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Sends the evening reminder to every user who is due. Users with reminders on are
 * read in pages; each is handled on its own, so one failure does not stop the rest.
 */
export async function runReminders(now: Date, sender: Sender, options: ReminderOptions = {}): Promise<RemindersResult> {
  const { pageSize = 100, appUrl } = options;
  const result: RemindersResult = { sent: 0, skipped: 0, failed: 0 };
  let cursor: QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db.collection("users").where("reminderEnabled", "==", true).orderBy("__name__").limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();

    const outcomes = await Promise.allSettled(page.docs.map((d) => remindUser(d.id, now, sender, appUrl)));
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") result[o.value]++;
      else {
        result.failed++;
        logger.error("Reminder failed for user", { uid: page.docs[i]!.id, error: String(o.reason) });
      }
    });

    if (page.size < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return result;
}

/** Used by the emulator, where FCM is not available: logs the message, reports success. */
export const loggingSender: Sender = {
  async sendEachForMulticast(message) {
    logger.info("[emulator] Would send push reminder", {
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
