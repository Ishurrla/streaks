/**
 * Habit schedules and streak milestones. Pure: no Firestore, no clock, so the app can
 * import it for display ("@streaks/core/schedule") and the server uses the same rules.
 *
 * Days are numbers 0 to 6, 0 = Monday. Dates are local "YYYY-MM-DD" strings.
 */
import { addDays, dayNumber } from "./streaks";

export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];
export const WEEKENDS: readonly number[] = [5, 6];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Streak lengths that earn a badge, the first time a habit's streak reaches them. */
export const MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100, 365];

/** A schedule that was in force up to and including `until`, before a later change. */
export interface PastDays {
  until: string;
  days: number[];
}

/** The schedule fields of a habit doc. All optional: old habits have none (every day). */
export interface HabitSchedule {
  /** Days in force now. Missing means every day. */
  days?: number[] | null;
  /** A change waiting to start on `nextDaysFrom` (the day after it was made). */
  nextDays?: number[] | null;
  nextDaysFrom?: string | null;
  /** Earlier schedules, so past days are judged by the days that applied then. */
  pastDays?: PastDays[] | null;
}

/** The weekday of a date, 0 = Monday. 1970-01-01 was a Thursday. */
export function weekdayOf(date: string): number {
  const n = dayNumber(date);
  if (Number.isNaN(n)) throw new Error(`Invalid date: ${date}`);
  return (((n + 3) % 7) + 7) % 7;
}

/** True for 1 to 7 unique integers from 0 to 6. */
export function isValidDays(days: unknown): days is number[] {
  return (
    Array.isArray(days) &&
    days.length >= 1 &&
    days.length <= 7 &&
    days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    new Set(days).size === days.length
  );
}

export const normaliseDays = (days: readonly number[]): number[] => [...new Set(days)].sort((a, b) => a - b);

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && normaliseDays(a).every((d, i) => d === normaliseDays(b)[i]);

/** The days that apply on `date`: a pending change from its start date, else the past schedule, else `days`. */
export function daysOn(habit: HabitSchedule, date: string): number[] {
  if (habit.nextDays && habit.nextDaysFrom && date >= habit.nextDaysFrom) return habit.nextDays;
  const past = [...(habit.pastDays ?? [])].sort((a, b) => a.until.localeCompare(b.until)).find((p) => date <= p.until);
  if (past) return past.days;
  return habit.days ?? [...ALL_DAYS];
}

/**
 * Whether the habit is due on `date`. The single rule for check-in, rollover, reminders
 * and the UI. A day that is not scheduled is a rest day: no check-in, never a miss.
 */
export function scheduledOn(habit: HabitSchedule, date: string): boolean {
  return daysOn(habit, date).includes(weekdayOf(date));
}

/** The next scheduled date after `date`, within the coming week (there always is one). */
export function nextScheduledAfter(habit: HabitSchedule, date: string): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    if (scheduledOn(habit, d)) return d;
  }
  return addDays(date, 1);
}

export const isEveryDay = (days: readonly number[]) => sameDays(days, ALL_DAYS);

/**
 * Field updates that make a pending change that has started (on or before `today`) the
 * current `days`, keeping the old days in `pastDays`. Null when there is nothing to apply.
 */
export interface ScheduleFields {
  days: number[];
  nextDays: number[] | null;
  nextDaysFrom: string | null;
  pastDays: PastDays[];
}

export function applyPendingDays(habit: HabitSchedule, today: string): ScheduleFields | null {
  if (!habit.nextDays || !habit.nextDaysFrom || habit.nextDaysFrom > today) return null;
  return {
    days: habit.nextDays,
    nextDays: null,
    nextDaysFrom: null,
    pastDays: [...(habit.pastDays ?? []), { until: addDays(habit.nextDaysFrom, -1), days: habit.days ?? [...ALL_DAYS] }],
  };
}

/**
 * Field updates for choosing `days` on `today`. The change starts tomorrow, so today keeps
 * the days it started with. Choosing the days already in force cancels a pending change.
 */
export function changeDays(habit: HabitSchedule, days: readonly number[], today: string): ScheduleFields {
  const applied = applyPendingDays(habit, today);
  const current: ScheduleFields = applied ?? {
    days: habit.days ?? [...ALL_DAYS],
    nextDays: null,
    nextDaysFrom: null,
    pastDays: habit.pastDays ?? [],
  };
  if (sameDays(days, current.days)) return { ...current, nextDays: null, nextDaysFrom: null };
  return { ...current, nextDays: normaliseDays(days), nextDaysFrom: addDays(today, 1) };
}

/** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri". */
export function describeDays(days: readonly number[]): string {
  if (isEveryDay(days)) return "Every day";
  if (sameDays(days, WEEKDAYS)) return "Weekdays";
  if (sameDays(days, WEEKENDS)) return "Weekends";
  return normaliseDays(days)
    .map((d) => DAY_SHORT[d])
    .join(", ");
}

/** Milestones a habit holds. Habits from before milestones existed hold every one up to their best streak. */
export function earnedMilestones(habit: { milestonesEarned?: number[] | null; bestStreak?: number | null }): number[] {
  if (Array.isArray(habit.milestonesEarned)) return habit.milestonesEarned;
  return MILESTONES.filter((m) => m <= (habit.bestStreak ?? 0));
}

/** Milestones a streak of `streak` reaches that are not held yet, lowest first. */
export function newMilestones(earned: readonly number[], streak: number): number[] {
  return MILESTONES.filter((m) => m <= streak && !earned.includes(m));
}

/** The next milestone above `streak`, or null past the last one. */
export function nextMilestone(streak: number): number | null {
  return MILESTONES.find((m) => m > streak) ?? null;
}
