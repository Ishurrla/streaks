import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { readHabits, rolloverUser, writeStats } from "./rollover";
import { addDays } from "./streaks";
import { isValidTimezone, localDate, nextLocalMidnight } from "./time";

/**
 * The only way to change a user's timezone. Any overdue rollover is settled in the
 * old timezone first, so a day that ended there is closed (and locked) before the
 * user's "today" moves. Then nextRolloverAt and every habit's stats are recomputed
 * for the new timezone.
 */
export async function updateTimezoneFor(uid: string, timezone: unknown, now: Date) {
  if (!isValidTimezone(timezone)) throw new HttpsError("invalid-argument", "Unknown time zone.");

  await rolloverUser(uid, now);

  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError("failed-precondition", "Profile not set up yet.");
    const habits = await readHabits(tx, uid);

    // After moving west the local date can be one that has already closed. Stats are
    // computed for the first open day, since the closed one can no longer be saved.
    const lastClosedDate = user.get("lastClosedDate") as string | undefined;
    const localToday = localDate(now, timezone);
    const firstOpenDay = lastClosedDate ? addDays(lastClosedDate, 1) : localToday;
    const today = localToday > firstOpenDay ? localToday : firstOpenDay;
    const nextRolloverAt = nextLocalMidnight(now, timezone);
    tx.update(userRef, { timezone, nextRolloverAt: Timestamp.fromDate(nextRolloverAt) });
    writeStats(tx, habits, today);
    return { timezone, today, nextRolloverAt: nextRolloverAt.toISOString() };
  });
}
