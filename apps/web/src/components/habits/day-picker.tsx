"use client";

import { ALL_DAYS, DAY_NAMES, DAY_SHORT, describeDays, WEEKDAYS, WEEKENDS } from "@streaks/core/schedule";
import { CalendarIcon } from "@/components/icons";

const PRESETS = [
  ["Every day", ALL_DAYS],
  ["Weekdays", WEEKDAYS],
  ["Weekends", WEEKENDS],
] as const;

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d) => b.includes(d));

/** "Every day", or "3 days a week · Mon · Wed · Fri". */
export function daysSummary(days: readonly number[]): string {
  if (days.length === 7) return "Every day";
  return `${days.length} ${days.length === 1 ? "day" : "days"} a week · ${describeDays(days)}`;
}

/**
 * "Repeat": quick picks plus seven day pills. An empty choice is shown as an error
 * here; the sheet refuses to save it.
 */
export function DayPicker({
  days,
  onChange,
  color,
  changing,
}: {
  days: number[];
  onChange: (days: number[]) => void;
  color: string;
  /** An existing habit: changes start tomorrow. */
  changing: boolean;
}) {
  const toggle = (d: number) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));

  return (
    // A fieldset, so "Repeat" names the quick choices and the day pills together, and each
    // button names itself ("Weekdays", "Monday"), so no inner groups are needed. min-w-0
    // undoes a fieldset's min-content width, which would stop the pills shrinking on phones;
    // mt-3 stands in for the legend's top margin, which a fieldset ignores.
    <fieldset className="mt-3 min-w-0" style={{ "--hc": color } as React.CSSProperties}>
      <legend className="field-label">Repeat</legend>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(([label, preset]) => (
          <button
            key={label}
            type="button"
            className="day-preset"
            aria-pressed={same(days, preset)}
            onClick={() => onChange([...preset])}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="day-pills">
        {DAY_SHORT.map((short, d) => (
          <button
            key={short}
            type="button"
            className="day-pill"
            aria-pressed={days.includes(d)}
            aria-label={DAY_NAMES[d]}
            onClick={() => toggle(d)}
          >
            <span aria-hidden="true">{LETTERS[d]}</span>
            <small aria-hidden="true">{short}</small>
          </button>
        ))}
      </div>
      {days.length === 0 ? (
        <div className="err" role="alert">
          Pick at least one day.
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <CalendarIcon className="size-4.5 flex-none text-accent" />
          <span>{daysSummary(days)}</span>
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted">
        Rest days never break your streak.{changing ? " Changes start tomorrow, so today's streak stays fair." : ""}
      </p>
    </fieldset>
  );
}
