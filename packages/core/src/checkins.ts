import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { CoreError } from "./errors";
import { db } from "./admin";
import { applyPendingDays, DAY_NAMES, earnedMilestones, newMilestones, scheduledOn, weekdayOf, type HabitSchedule } from "./schedule";
import { computeStreaks, type StreakStats } from "./streaks";
import { localDate } from "./time";

export interface CheckInResult extends StreakStats {
  /** The server's idea of the user's local date; the day that was checked in or undone. */
  date: string;
  /** false when nothing changed: already checked in (checkIn) or nothing to undo (undoCheckIn). */
  changed: boolean;
  /** The milestone this check-in earned for the first time (the highest, if several), else null. */
  milestoneReached: number | null;
}

/** computeStreaks for one habit, counting only the days it is scheduled. */
export function streaksFor(habit: HabitSchedule, checkInDates: readonly string[], freezeDates: readonly string[], today: string) {
  return computeStreaks(checkInDates, freezeDates, today, (d) => scheduledOn(habit, d));
}

export function habitRef(uid: string, habitId: string): DocumentReference {
  return db().collection("users").doc(uid).collection("habits").doc(habitId);
}

/** Every completed date for a habit, read inside the transaction. Only IDs are fetched. */
export async function readHistory(tx: Transaction, habit: DocumentReference) {
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
  const userRef = db().collection("users").doc(uid);
  const habit = habitRef(uid, habitId);
  const [userSnap, habitSnap] = await Promise.all([tx.get(userRef), tx.get(habit)]);
  if (!userSnap.exists) throw new CoreError("failed-precondition", "Profile not set up yet.");
  if (!habitSnap.exists) throw new CoreError("not-found", "Habit not found.");

  const today = localDate(now, userSnap.get("timezone") as string);

  // Days up to lastClosedDate have been settled by the rollover job. Refusing them
  // stops a timezone change from reopening a day that already ended.
  const lastClosedDate = userSnap.get("lastClosedDate") as string | null | undefined;
  if (lastClosedDate && today <= lastClosedDate) {
    throw new CoreError("failed-precondition", "That day has already closed.");
  }

  return { habit, habitSnap, today };
}

export function currentStats(snap: DocumentSnapshot): StreakStats {
  return {
    currentStreak: (snap.get("currentStreak") as number) ?? 0,
    bestStreak: (snap.get("bestStreak") as number) ?? 0,
    lastCheckInDate: (snap.get("lastCheckInDate") as string | null) ?? null,
  };
}

const sortedNumbers = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b);

export async function checkInFor(uid: string, habitId: string, now: Date): Promise<CheckInResult> {
  return db().runTransaction(async (tx) => {
    const { habit, habitSnap, today } = await loadContext(tx, uid, habitId, now);
    const data = habitSnap.data()!;
    if (!scheduledOn(data, today)) {
      throw new CoreError("NOT_SCHEDULED", `This habit rests on ${DAY_NAMES[weekdayOf(today)]}s. Your streak is safe.`);
    }
    const checkInRef = habit.collection("checkIns").doc(today);
    const [existing, history] = await Promise.all([tx.get(checkInRef), readHistory(tx, habit)]);

    // Second check-in for the same day: harmless no-op.
    if (existing.exists) return { date: today, changed: false, milestoneReached: null, ...currentStats(habitSnap) };

    const stats = streaksFor(data, [...history.checkInDates, today], history.freezeDates, today);
    // Only check-ins earn milestones, and each one once per habit: the earned list never
    // shrinks on a reset, so reaching 7 again later is not new.
    const earned = earnedMilestones(data);
    const added = newMilestones(earned, stats.currentStreak);
    // Kept on the check-in so undoing it takes back exactly what it gave. The streak
    // stats need nothing stored: recomputing without today gives the old ones back.
    tx.create(checkInRef, { createdAt: FieldValue.serverTimestamp(), milestonesAdded: added });
    tx.update(habit, {
      ...stats,
      milestonesEarned: sortedNumbers([...earned, ...added]),
      ...applyPendingDays(data, today),
    });
    return { date: today, changed: true, milestoneReached: added.length ? added[added.length - 1]! : null, ...stats };
  });
}

export async function undoCheckInFor(uid: string, habitId: string, now: Date): Promise<CheckInResult> {
  return db().runTransaction(async (tx) => {
    const { habit, habitSnap, today } = await loadContext(tx, uid, habitId, now);
    // Only today's document is ever addressed, so past days cannot be undone.
    const checkInRef = habit.collection("checkIns").doc(today);
    const [existing, history] = await Promise.all([tx.get(checkInRef), readHistory(tx, habit)]);

    if (!existing.exists) return { date: today, changed: false, milestoneReached: null, ...currentStats(habitSnap) };

    const data = habitSnap.data()!;
    const stats = streaksFor(
      data,
      history.checkInDates.filter((d) => d !== today),
      history.freezeDates,
      today,
    );
    // A check-in from before milestones existed has no milestonesAdded; then the habit's
    // list (or its backfill from the best streak without today) is already right.
    const removed = (existing.get("milestonesAdded") as number[] | undefined) ?? [];
    const earned = earnedMilestones({ milestonesEarned: data.milestonesEarned as number[] | undefined, bestStreak: stats.bestStreak });
    tx.delete(checkInRef);
    tx.update(habit, {
      ...stats,
      milestonesEarned: earned.filter((m) => !removed.includes(m)),
    });
    return { date: today, changed: true, milestoneReached: null, ...stats };
  });
}
