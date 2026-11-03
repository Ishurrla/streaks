import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { CoreError } from "./errors";
import { auth, db } from "./admin";
import { NAME_MAX } from "./model";
import { addDays } from "./streaks";
import { DEFAULT_TIMEZONE, isValidTimezone, localDate, nextLocalMidnight } from "./time";

export interface EnsureProfileInput {
  name?: unknown;
  timezone?: unknown;
}

function cleanName(name: unknown, fallback: string): string {
  const trimmed = typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "";
  if (trimmed) return trimmed;
  return fallback.trim().slice(0, NAME_MAX) || "Friend";
}

/**
 * The name to use when the client sends none, as with Google sign-in: the first name from
 * the token's name claim, else the part of the email before the @.
 */
export function nameFromClaims(name: unknown, email: unknown): string {
  const first = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  if (first) return first;
  return typeof email === "string" ? (email.split("@")[0] ?? "") : "";
}

/**
 * Creates `users/{uid}` if it does not exist yet. Calling it again is a no-op, so the
 * client can call it after every sign-in. `name` and `timezone` are only used on
 * creation; after that, name changes go through the client and timezone through
 * `updateTimezone`.
 */
export async function ensureProfileFor(
  uid: string,
  input: EnsureProfileInput,
  now: Date,
  fallbackName = "",
): Promise<{ created: boolean }> {
  const ref = db().collection("users").doc(uid);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { created: false };

    // An account being deleted is disabled first; never bring its profile back.
    const user = await auth().getUser(uid).catch(() => null);
    if (!user || user.disabled) {
      throw new CoreError("permission-denied", "This account is closed.", { reason: "account-closed" });
    }

    const timezone = isValidTimezone(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
    tx.create(ref, {
      name: cleanName(input.name, fallbackName),
      timezone,
      reminderEnabled: false,
      reminderTime: "20:00",
      theme: "system",
      freezesAvailable: 1,
      nextRolloverAt: Timestamp.fromDate(nextLocalMidnight(now, timezone)),
      lastReminderDate: null,
      // Reminders start off; syncReminderSchedule sets this when they are turned on.
      nextReminderAt: null,
      // Nothing before sign-up can be checked in.
      lastClosedDate: addDays(localDate(now, timezone), -1),
      createdAt: FieldValue.serverTimestamp(),
    });
    return { created: true };
  });
}
