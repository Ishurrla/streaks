"use client";

import {
  daysOn,
  earnedMilestones,
  isEveryDay,
  MILESTONE_NAMES,
  MILESTONES,
  nextMilestone,
  previousMilestone,
  scheduledOn,
} from "@streaks/core/schedule";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, LockIcon, StarIcon } from "@/components/icons";
import { PageHead } from "@/components/views/page-head";
import { EmptyRow, ErrorCard, LoadingCards } from "@/components/views/states";
import { useCheckInDays, useHabits, type Habit } from "@/lib/data";
import { addDays, localToday, longDate, useLocalToday } from "@/lib/dates";
import { useProfile } from "@/lib/profile";

/** Rendered inside a Suspense boundary (see the page), as useSearchParams needs. */
export function ProgressView() {
  const profile = useProfile();
  const habits = useHabits(profile.uid);
  // ?habit=<id>&badge=<n>, from the milestone celebration's "See my badges".
  const params = useSearchParams();
  const badge = Number(params.get("badge"));
  const linked = { habit: params.get("habit"), badge: MILESTONES.includes(badge) ? badge : null };
  const [picked, setPicked] = useState<string | null>(linked.habit);

  const list = habits.data ?? [];
  const habit = list.find((h) => h.id === picked) ?? list[0];

  // A habit picked from a link can sit past the end of the chip row; bring it into view.
  const chips = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chips.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [habit?.id]);

  return (
    <>
      <PageHead title="Progress" />
      {habits.error ? (
        <ErrorCard message="We could not load your habits." onRetry={habits.retry} />
      ) : !habits.data ? (
        <LoadingCards count={2} />
      ) : !habit ? (
        <EmptyRow title="Nothing to show yet" body="Add a habit and check it off to see your calendar." />
      ) : (
        <>
          <div ref={chips} className="mb-3.5 flex gap-2 overflow-x-auto pb-1.5" role="group" aria-label="Choose a habit">
            {list.map((h) => {
              const on = h.id === habit.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(h.id)}
                  style={{ "--hc": h.color } as React.CSSProperties}
                  className={`min-h-11 flex-none rounded-full border-[1.5px] px-3.5 py-2 text-sm ${
                    on ? "border-(--hc) bg-(--hc) font-bold text-white" : "border-line bg-surface font-medium"
                  }`}
                >
                  {h.name}
                </button>
              );
            })}
          </div>
          <HabitProgress
            key={habit.id}
            uid={profile.uid}
            habit={habit}
            timezone={profile.timezone}
            freshBadge={linked.habit === habit.id ? linked.badge : null}
          />
        </>
      )}
    </>
  );
}

function HabitProgress({
  uid,
  habit,
  timezone,
  freshBadge,
}: {
  uid: string;
  habit: Habit;
  timezone: string;
  freshBadge: number | null;
}) {
  const today = useLocalToday(timezone);
  const unit = isEveryDay(daysOn(habit, today)) ? "days" : "in a row";

  return (
    <div className="grid gap-3.5">
      <div className="grid grid-cols-2 gap-2.5 desk:max-w-[560px]">
        <Tile label="Current streak" icon={<Flame className="size-4!" />} value={habit.currentStreak} unit={unit} />
        <Tile label="Best streak" icon={<StarIcon className="size-4 text-flame" />} value={habit.bestStreak} unit={unit} />
      </div>
      <div className="grid gap-3.5 desk:grid-cols-2 desk:items-start desk:gap-5">
        <Milestones habit={habit} freshBadge={freshBadge} />
        <FiveWeeks uid={uid} habit={habit} today={today} timezone={timezone} />
      </div>
    </div>
  );
}

function Milestones({ habit, freshBadge }: { habit: Habit; freshBadge: number | null }) {
  const streak = habit.currentStreak;
  const next = nextMilestone(streak);
  const base = previousMilestone(streak);
  const left = next ? next - streak : 0;
  const earned = earnedMilestones(habit);

  return (
    <section className="rounded-[20px] bg-surface p-4 shadow-card" aria-labelledby="milestones-title">
      <h2 id="milestones-title" className="mb-3 text-lg">
        Milestones
      </h2>
      {next ? (
        <>
          <div className="mb-3.5 flex items-center gap-3.5">
            <div className="font-display text-[38px] leading-[1.05] font-extrabold tabular-nums">{streak}</div>
            <div>
              <div className="font-bold">
                Next: {MILESTONE_NAMES[next]} ({next})
              </div>
              <div className="text-sm text-muted">
                {left} more {left === 1 ? "check-in" : "check-ins"} to go
              </div>
            </div>
          </div>
          <div
            className="milestone-bar"
            role="progressbar"
            aria-valuenow={streak}
            aria-valuemin={base}
            aria-valuemax={next}
            aria-label={`Progress to ${MILESTONE_NAMES[next]}`}
          >
            <i style={{ width: `${Math.max(4, Math.round(((streak - base) / (next - base)) * 100))}%` }} />
          </div>
        </>
      ) : (
        <p className="font-bold">Every milestone earned. Legend.</p>
      )}
      <ul className="badges">
        {MILESTONES.map((m) => {
          const on = earned.includes(m);
          return (
            <li key={m} className={`badge ${on ? "on" : "off"} ${on && m === freshBadge ? "fresh" : ""}`}>
              <div className="medal" aria-hidden="true">
                {m}
                {!on && <LockIcon />}
              </div>
              <span>
                <span className="sr-only">{on ? "Earned: " : "Locked: "}</span>
                {MILESTONE_NAMES[m]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const WEEKS = 5;

/** The Sunday ending the week that `date` is in (weeks run Monday to Sunday). */
function weekEnd(date: string): string {
  const monday0 = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, 6 - monday0);
}

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Five weeks of one habit, ending with this week, paged five weeks at a time. Each date is
 * judged with scheduledOn, so a past week shows the days that were scheduled back then.
 * A rest day is dashed and never a miss; a missed day is shown softly.
 */
function FiveWeeks({ uid, habit, today, timezone }: { uid: string; habit: Habit; today: string; timezone: string }) {
  const [page, setPage] = useState(0);
  const end = addDays(weekEnd(today), -7 * WEEKS * page);
  const start = addDays(end, -(7 * WEEKS - 1));
  const dates = Array.from({ length: 7 * WEEKS }, (_, i) => addDays(start, i));

  const checkIns = useCheckInDays(uid, [habit.id], start, end);
  const freezes = useCheckInDays(uid, [habit.id], start, end, "freezeUses");
  const done = new Set(checkIns.data?.[habit.id] ?? []);
  const frozen = new Set(freezes.data?.[habit.id] ?? []);

  // Nothing to see before the habit existed.
  const created = habit.createdAt ? localToday(timezone, habit.createdAt.toDate()) : today;
  const atStart = start <= created;

  function status(d: string): { cls: string; label: string } {
    if (d > today) return { cls: "future", label: "upcoming" };
    if (done.has(d)) return { cls: "done", label: "done" };
    if (frozen.has(d)) return { cls: "frozen", label: "streak freeze used" };
    if (d < created) return { cls: "", label: "before this habit" };
    if (!scheduledOn(habit, d)) return { cls: "rest", label: "rest day" };
    if (d === today) return { cls: "", label: "not done yet" };
    return { cls: "miss", label: "missed" };
  }

  return (
    <section
      className="rounded-[20px] bg-surface p-4 shadow-card"
      style={{ "--hc": habit.color } as React.CSSProperties}
      aria-labelledby="weeks-title"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          className="grid size-11 flex-none place-items-center rounded-full border-[1.5px] border-line disabled:opacity-30"
          aria-label="Earlier weeks"
          disabled={atStart}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronLeft />
        </button>
        <h2 id="weeks-title" className="text-center text-lg" aria-live="polite">
          {page === 0 ? "Last 5 weeks" : `${shortDate(start)} to ${shortDate(end)}`}
        </h2>
        <button
          type="button"
          className="grid size-11 flex-none place-items-center rounded-full border-[1.5px] border-line disabled:opacity-30"
          aria-label="Later weeks"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronRight />
        </button>
      </div>

      {checkIns.error || freezes.error ? (
        <ErrorCard
          message="We could not load these weeks."
          onRetry={() => {
            checkIns.retry();
            freezes.retry();
          }}
        />
      ) : (
        <div
          className={`grid grid-cols-7 gap-1.5 transition-opacity ${checkIns.isLoading ? "opacity-50" : ""}`}
          aria-busy={checkIns.isLoading}
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="text-center text-xs font-bold text-muted" aria-hidden="true">
              {d}
            </div>
          ))}
          {dates.map((d) => {
            const s = status(d);
            return (
              <div
                key={d}
                className={`cal-day ${s.cls} ${d === today ? "today" : ""}`}
                aria-label={`${longDate(d)}: ${s.label}`}
                title={s.cls === "frozen" ? "Streak freeze used" : undefined}
              >
                {Number(d.slice(8))}
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-legend" aria-hidden="true">
        <span>
          <i className="cal-day done" />
          Done
        </span>
        <span>
          <i className="cal-day miss" />
          Missed
        </span>
        <span>
          <i className="cal-day rest" />
          Rest day
        </span>
        <span>
          <i className="cal-day frozen" />
          Freeze used
        </span>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
        <LockIcon className="mt-0.5 size-4 flex-none" />
        <span>Past days are locked. Streaks are worked out on the server, so they cannot be edited here.</span>
      </p>
    </section>
  );
}

function Tile({ label, icon, value, unit }: { label: string; icon: React.ReactNode; value: number; unit: "days" | "in a row" }) {
  return (
    <div className="rounded-[18px] bg-surface px-4 py-3.5 shadow-card">
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        {icon}
        {label}
      </span>
      <b className="font-display text-[38px] leading-[1.1] font-extrabold tabular-nums">{value}</b>
      <small className="ml-1 text-sm text-muted">{unit === "days" ? (value === 1 ? "day" : "days") : "in a row"}</small>
    </div>
  );
}
