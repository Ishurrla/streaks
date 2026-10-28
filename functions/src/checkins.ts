import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin";
import { computeStreaks, type StreakStats } from "./streaks";
import { localDate } from "./time";

export interface CheckInResult extends StreakStats {
  /** The server's idea of the user's local date; the day that was checked in or undone. */
  date: string;
  /** false when nothing changed: already checked in (checkIn) or nothing to undo (undoCheckIn). */
  changed: boolean;
}

export function habitRef(uid: string, habitId: string): DocumentReference {
  return db.collection("users").doc(uid).collection("habits").doc(habitId);
}

/** Every completed date for a habit, read inside the transaction. Only IDs are fetched. */
async function readHistory(tx: Transaction, habit: DocumentReference) {
  const [checkIns, freezes] = await Promise.all([
    tx.get(habit.collection("checkIns").select()),
    tx.get(habit.collection("freezeUses").select()),
  ]);
  return {
    checkInDates: checkIns.docs.map((d) => d.id),
    freezeDates: freezes.docs.map((d) => d.id),
  };
}

/**
 * Loads the user and habit and works out today's date in the user's timezone.
 * The habit is looked up under the caller's own uid, so another user's habit
 * is simply "not found".
 */
async function loadContext(tx: Transaction, uid: string, habitId: string, now: Date) {
  const userRef = db.collection("users").doc(uid);
  const habit = habitRef(uid, habitId);
  const [userSnap, habitSnap] = await Promise.all([tx.get(userRef), tx.get(habit)]);
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profile not set up yet.");
  if (!habitSnap.exists) throw new HttpsError("not-found", "Habit not found.");

  const today = localDate(now, userSnap.get("timezone") as string);

  // Days up to lastClosedDate have been settled by the rollover job. Refusing them
  // stops a timezone change from reopening a day that already ended.
  const lastClosedDate = userSnap.get("lastClosedDate") as string | null | undefined;
  if (lastClosedDate && today <= lastClosedDate) {
    throw new HttpsError("failed-precondition", "That day has already closed.");
  }

  return { habit, habitSnap, today };
}

function currentStats(snap: DocumentSnapshot): StreakStats {
  return {
    currentStreak: (snap.get("currentStreak") as number) ?? 0,
    bestStreak: (snap.get("bestStreak") as number) ?? 0,
    lastCheckInDate: (snap.get("lastCheckInDate") as string | null) ?? null,
  };
}

export async function checkInFor(uid: string, habitId: string, now: Date): Promise<CheckInResult> {
  return db.runTransaction(async (tx) => {
    const { habit, habitSnap, today } = await loadContext(tx, uid, habitId, now);
    const checkInRef = habit.collection("checkIns").doc(today);
    const [existing, history] = await Promise.all([tx.get(checkInRef), readHistory(tx, habit)]);

    // Second check-in for the same day: harmless no-op.
    if (existing.exists) return { date: today, changed: false, ...currentStats(habitSnap) };

    const stats = computeStreaks([...history.checkInDates, today], history.freezeDates, today);
    tx.create(checkInRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(habit, { ...stats });
    return { date: today, changed: true, ...stats };
  });
}

export async function undoCheckInFor(uid: string, habitId: string, now: Date): Promise<CheckInResult> {
  return db.runTransaction(async (tx) => {
    const { habit, habitSnap, today } = await loadContext(tx, uid, habitId, now);
    // Only today's document is ever addressed, so past days cannot be undone.
    const checkInRef = habit.collection("checkIns").doc(today);
    const [existing, history] = await Promise.all([tx.get(checkInRef), readHistory(tx, habit)]);

    if (!existing.exists) return { date: today, changed: false, ...currentStats(habitSnap) };

    const stats = computeStreaks(
      history.checkInDates.filter((d) => d !== today),
      history.freezeDates,
      today,
    );
    tx.delete(checkInRef);
    tx.update(habit, { ...stats });
    return { date: today, changed: true, ...stats };
  });
}
