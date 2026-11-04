import { db } from "./admin";
import { habitRef } from "./checkins";
import { CoreError } from "./errors";
import { changeDays, isValidDays, type HabitSchedule, type ScheduleFields } from "./schedule";
import { localDate } from "./time";

/** `days` as sent by the client: 1 to 7 unique integers from 0 (Monday) to 6 (Sunday). */
export function requireDays(value: unknown): number[] {
  if (!isValidDays(value)) {
    throw new CoreError("invalid-argument", "days must be 1 to 7 different whole numbers from 0 (Monday) to 6 (Sunday).");
  }
  return value;
}

/**
 * Changes which days a habit is due. The change starts tomorrow in the user's timezone,
 * so today's streak is judged by the days it started with. The habit is looked up under
 * the caller's own uid, so another user's habit is "not found".
 */
export async function updateHabitDaysFor(uid: string, habitId: string, days: number[], now: Date): Promise<ScheduleFields> {
  const userRef = db().collection("users").doc(uid);
  const habit = habitRef(uid, habitId);
  return db().runTransaction(async (tx) => {
    const [userSnap, habitSnap] = await Promise.all([tx.get(userRef), tx.get(habit)]);
    if (!userSnap.exists) throw new CoreError("failed-precondition", "Profile not set up yet.");
    if (!habitSnap.exists) throw new CoreError("not-found", "Habit not found.");
    const today = localDate(now, userSnap.get("timezone") as string);
    const update = changeDays(habitSnap.data() as HabitSchedule, days, today);
    tx.update(habit, { ...update });
    return update;
  });
}

/**
 * Deletes a habit and everything under it (checkIns, freezeUses). Firestore does not
 * cascade, so `recursiveDelete` walks the subcollections. Deleting a habit that is
 * already gone is not an error.
 */
export async function deleteHabitFor(uid: string, habitId: string): Promise<{ deleted: boolean }> {
  const ref = habitRef(uid, habitId);
  const snap = await ref.get();
  await db().recursiveDelete(ref);
  return { deleted: snap.exists };
}
