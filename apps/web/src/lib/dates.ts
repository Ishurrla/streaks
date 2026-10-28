// Display-only date helpers. They work out what to show for the user's saved timezone.
// The server decides which day a check-in belongs to; nothing here is ever sent to it.

function parts(now: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const get = (type: string) => fmt.formatToParts(now).find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Today's date (YYYY-MM-DD) in `timezone`, used to find today's check-in documents. */
export function localToday(timezone: string, now = new Date()): string {
  return parts(now, timezone).date;
}

export function greeting(timezone: string, now = new Date()): string {
  const { hour } = parts(now, timezone);
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** "Wednesday 28 October" for a YYYY-MM-DD date. */
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
