import { FieldValue, Timestamp, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { log } from "./log";
import { db } from "./admin";
import { readHistory, streaksFor } from "./checkins";
import { applyPendingDays, earnedMilestones, scheduledOn, type HabitSchedule } from "./schedule";
import { addDays, type StreakStats } from "./streaks";
import { localDate, nextLocalMidnight } from "./time";

interface HabitState {
  snap: QueryDocumentSnapshot;
  checkInDates: string[];
  freezeDates: string[];
}

const isDone = (h: HabitState, date: string) => h.checkInDates.includes(date) || h.freezeDates.includes(date);
const scheduleOf = (h: HabitState) => h.snap.data() as HabitSchedule;

/** The last scheduled day before `date`, within the week before it. */
function previousScheduled(h: HabitState, date: string): string | null {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    if (scheduledOn(scheduleOf(h), d)) return d;
  }
  return null;
}

/** How many unclosed days a late cron or a returning user can close in one go. */
const MAX_CATCH_UP_DAYS = 7;

/** Reads every habit of a user together with its full history, inside the transaction. */
export async function readHabits(tx: Transaction, uid: string): Promise<HabitState[]> {
  const habits = await tx.get(db().collection("users").doc(uid).collection("habits"));
  return Promise.all(habits.docs.map(async (snap) => ({ snap, ...(await readHistory(tx, snap.ref)) })));
}

/**
 * Writes recomputed stats for every habit whose stored stats are out of date. Also makes
 * a day change that has started the current `days`, and gives habits from before
 * milestones existed their milestonesEarned (from bestStreak, without a celebration).
 */
export function writeStats(tx: Transaction, habits: HabitState[], today: string): void {
  for (const h of habits) {
    const stored = h.snap.data();
    const stats: StreakStats = streaksFor(scheduleOf(h), h.checkInDates, h.freezeDates, today);
    const update: Record<string, unknown> = { ...applyPendingDays(scheduleOf(h), today) };
    if (
      stored.currentStreak !== stats.currentStreak ||
      stored.bestStreak !== stats.bestStreak ||
      (stored.lastCheckInDate ?? null) !== stats.lastCheckInDate
    ) {
      Object.assign(update, stats);
    }
    if (!Array.isArray(stored.milestonesEarned)) {
      update.milestonesEarned = earnedMilestones({ bestStreak: Math.max(stored.bestStreak ?? 0, stats.bestStreak) });
    }
    if (Object.keys(update).length) tx.update(h.snap.ref, update);
  }
}

/**
 * Closes the day that just ended for one user, if their local midnight has passed.
 *
 * Every day since lastClosedDate (at most a week) is closed in order. For each habit
 * scheduled on that day and not done: if its previous scheduled day was done (so exactly
 * one scheduled day is missed) and a freeze is available, spend one and write
 * freezeUses/{day}. Freezes go to the longest streaks first. A rest day is never a miss,
 * so it never uses a freeze. Stats for every habit are then recomputed with
 * computeStreaks, which breaks any streak that was not covered.
 *
 * Returns false when there was nothing to do. Because it re-checks nextRolloverAt
 * inside the transaction and then moves it past `now`, running it twice is a no-op.
 */
export async function rolloverUser(uid: string, now: Date): Promise<boolean> {
  const userRef = db().collection("users").doc(uid);
  return db().runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) return false;
    const nextRolloverAt = user.get("nextRolloverAt") as Timestamp | undefined;
    if (nextRolloverAt && nextRolloverAt.toMillis() > now.getTime()) return false;

    const timezone = user.get("timezone") as string;
    const today = localDate(now, timezone);
    const closedDay = addDays(today, -1);
    const lastClosedDate = user.get("lastClosedDate") as string | undefined;
    const habits = await readHabits(tx, uid);

    // The days to close: everything after lastClosedDate up to yesterday, oldest first.
    const toClose: string[] = [];
    if (!lastClosedDate) toClose.push(closedDay);
    else {
      const earliest = addDays(today, -MAX_CATCH_UP_DAYS);
      for (let d = addDays(lastClosedDate, 1) < earliest ? earliest : addDays(lastClosedDate, 1); d <= closedDay; d = addDays(d, 1)) {
        toClose.push(d);
      }
    }

    // Reads are done; everything below only writes.
    let freezes = (user.get("freezesAvailable") as number | undefined) ?? 0;
    for (const day of toClose) {
      const candidates = habits
        .filter((h) => scheduledOn(scheduleOf(h), day) && !isDone(h, day))
        .map((h) => ({ h, before: previousScheduled(h, day) }))
        .filter((c): c is { h: HabitState; before: string } => c.before !== null && isDone(c.h, c.before))
        .map(({ h, before }) => ({ h, streak: streaksFor(scheduleOf(h), h.checkInDates, h.freezeDates, before).currentStreak }))
        .sort((a, b) => b.streak - a.streak || a.h.snap.id.localeCompare(b.h.snap.id));

      for (const { h } of candidates) {
        if (freezes <= 0) break;
        tx.create(h.snap.ref.collection("freezeUses").doc(day), { createdAt: FieldValue.serverTimestamp() });
        h.freezeDates.push(day);
        freezes--;
      }
    }

    writeStats(tx, habits, today);

    tx.update(userRef, {
      freezesAvailable: freezes,
      nextRolloverAt: Timestamp.fromDate(nextLocalMidnight(now, timezone)),
      lastClosedDate: lastClosedDate && lastClosedDate > closedDay ? lastClosedDate : closedDay,
    });
    return true;
  });
}

export interface RolloverResult {
  rolledOver: number;
  skipped: number;
  failed: number;
  /** false when the time budget ran out; the rest are picked up by the next run. */
  done: boolean;
}

export interface RolloverOptions {
  pageSize?: number;
  /** Wall-clock time (ms) after which no new page is started. */
  deadline?: number;
}

/**
 * Rolls over every user whose local midnight has passed. Users are read in pages and
 * one user's failure is logged and counted without stopping the rest; a failed user
 * keeps their old nextRolloverAt, so the next run retries them. With a deadline, no new
 * page starts after it; anyone left is still due and is picked up by the next run.
 */
export async function runRollover(now: Date, { pageSize = 100, deadline = Infinity }: RolloverOptions = {}): Promise<RolloverResult> {
  const result: RolloverResult = { rolledOver: 0, skipped: 0, failed: 0, done: false };
  let cursor: QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db()
      .collection("users")
      .where("nextRolloverAt", "<=", Timestamp.fromDate(now))
      .orderBy("nextRolloverAt")
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();

    const outcomes = await Promise.allSettled(page.docs.map((d) => rolloverUser(d.id, now)));
    outcomes.forEach((o, i) => {
      if (o.status === "fulfilled") {
        if (o.value) result.rolledOver++;
        else result.skipped++;
      } else {
        result.failed++;
        log.error("Rollover failed for user", { uid: page.docs[i]!.id, error: String(o.reason) });
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
