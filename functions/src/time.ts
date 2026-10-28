import { DateTime, IANAZone } from "luxon";

export const DEFAULT_TIMEZONE = "Africa/Lagos";

export function isValidTimezone(tz: unknown): tz is string {
  return typeof tz === "string" && tz.length > 0 && tz.length <= 64 && IANAZone.isValidZone(tz);
}

/** The calendar date (YYYY-MM-DD) that `now` falls on in `timezone`. */
export function localDate(now: Date, timezone: string): string {
  return DateTime.fromJSDate(now, { zone: timezone }).toISODate()!;
}

/**
 * The UTC instant of the first local midnight strictly after `now` in `timezone`.
 * If midnight does not exist that day (a DST jump at 00:00), Luxon moves it to the
 * first valid instant of the day, which is still the start of that local date.
 */
export function nextLocalMidnight(now: Date, timezone: string): Date {
  return DateTime.fromJSDate(now, { zone: timezone }).startOf("day").plus({ days: 1 }).toJSDate();
}
