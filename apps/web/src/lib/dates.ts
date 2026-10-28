"use client";

import { useEffect, useState } from "react";

// Display-only date helpers. They work out what to show for the user's saved timezone.
// The server decides which day a check-in belongs to; nothing here is ever sent to it.
// Dates are "YYYY-MM-DD" strings; arithmetic on them is done in UTC so it never
// depends on the browser's own timezone.

function parts(now: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const all = fmt.formatToParts(now);
  const get = (type: string) => all.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Today's date (YYYY-MM-DD) in `timezone`, used to find today's check-in documents. */
export function localToday(timezone: string, now = new Date()): string {
  return parts(now, timezone).date;
}

/** Today in `timezone`, updating when the local date changes while the app is open. */
export function useLocalToday(timezone: string): string {
  const [today, setToday] = useState(() => localToday(timezone));
  useEffect(() => {
    const tick = () => setToday(localToday(timezone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [timezone]);
  return today;
}

export function greeting(timezone: string, now = new Date()): string {
  const { hour } = parts(now, timezone);
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Wednesday 28 October" */
export function longDate(date: string): string {
  return utc(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** "We" */
export function weekdayShort(date: string): string {
  return utc(date).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 2);
}

export interface Month {
  year: number;
  month: number; // 0-11
}

export function monthOf(date: string): Month {
  const d = utc(date);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export function shiftMonth({ year, month }: Month, by: number): Month {
  const d = new Date(Date.UTC(year, month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export function compareMonths(a: Month, b: Month): number {
  return a.year - b.year || a.month - b.month;
}

export function monthLabel({ year, month }: Month): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Every date in the month, plus how many blank cells precede day 1 in a Monday-first grid. */
export function monthDays({ year, month }: Month): { lead: number; dates: string[] } {
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const mm = String(month + 1).padStart(2, "0");
  const dates = Array.from({ length: count }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
  return { lead, dates };
}
