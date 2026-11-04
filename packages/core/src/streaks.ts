/**
 * Streak maths. Pure and synchronous: no Firestore, no clock. Every place that
 * writes habit stats (checkIn, undoCheckIn, the rollover job) goes through this.
 *
 * Dates are local calendar dates as "YYYY-MM-DD" strings in the user's timezone.
 */

export interface StreakStats {
  /** Run of completed days ending today, or ending yesterday if today is not done yet. */
  currentStreak: number;
  /** Longest run of completed days ever. */
  bestStreak: number;
  /** Most recent real check-in on or before today (freezes do not count), or null. */
  lastCheckInDate: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a YYYY-MM-DD string, or NaN if it is not a real date. */
export function dayNumber(date: string): number {
  if (!DATE_RE.test(date)) return NaN;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  // Reject dates like 2026-02-30 that Date.UTC would quietly roll over.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN;
  return ms / DAY_MS;
}

/** Adds `days` (may be negative) to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const n = dayNumber(date);
  if (Number.isNaN(n)) throw new Error(`Invalid date: ${date}`);
  return new Date((n + days) * DAY_MS).toISOString().slice(0, 10);
}

const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Streaks count scheduled days only: a rest day neither adds to a run nor breaks it.
 *
 * @param checkInDates days the habit was done
 * @param freezeDates days covered by a streak freeze; they count as completed
 * @param today the user's current local date
 * @param isScheduled whether the habit is due on a date (scheduledOn); every day if left out
 */
export function computeStreaks(
  checkInDates: readonly string[],
  freezeDates: readonly string[],
  today: string,
  isScheduled: (date: string) => boolean = () => true,
): StreakStats {
  const todayN = dayNumber(today);
  if (Number.isNaN(todayN)) throw new Error(`Invalid date: ${today}`);

  // Ignore malformed dates and anything after today.
  const valid = (d: string) => {
    const n = dayNumber(d);
    return !Number.isNaN(n) && n <= todayN;
  };
  const checkIns = checkInDates.filter(valid);
  const done = new Set<number>([...checkIns, ...freezeDates.filter(valid)].map(dayNumber));

  // Walk every day from the first completed one to today. A scheduled day that was done
  // extends the run; one that was missed ends it, except today, which is still open
  // ("at risk"). So the run left at the end is the current streak.
  let bestStreak = 0;
  let run = 0;
  if (done.size > 0) {
    for (let n = Math.min(...done); n <= todayN; n++) {
      if (!isScheduled(fromDayNumber(n))) continue;
      if (done.has(n)) {
        run++;
        if (run > bestStreak) bestStreak = run;
      } else if (n !== todayN) {
        run = 0;
      }
    }
  }
  const currentStreak = run;

  const lastCheckInDate = checkIns.length === 0 ? null : checkIns.reduce((a, b) => (a > b ? a : b));

  return { currentStreak, bestStreak, lastCheckInDate };
}
