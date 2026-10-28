import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
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
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { created: false };

    // An account being deleted is disabled first; never bring its profile back.
    const user = await auth.getUser(uid).catch(() => null);
    if (!user || user.disabled) throw new HttpsError("failed-precondition", "This account is closed.");

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
      // Nothing before sign-up can be checked in.
      lastClosedDate: addDays(localDate(now, timezone), -1),
      createdAt: FieldValue.serverTimestamp(),
    });
    return { created: true };
  });
}
