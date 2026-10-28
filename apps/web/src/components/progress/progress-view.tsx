"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Flame, LockIcon, StarIcon } from "@/components/icons";
import { PageHead } from "@/components/views/page-head";
import { EmptyRow, ErrorCard, LoadingCards } from "@/components/views/states";
import { useCheckInDays, useHabits, type Habit } from "@/lib/data";
import {
  compareMonths,
  localToday,
  monthDays,
  monthLabel,
  monthOf,
  shiftMonth,
  useLocalToday,
  type Month,
} from "@/lib/dates";
import { useProfile } from "@/lib/profile";

export function ProgressView() {
  const profile = useProfile();
  const habits = useHabits(profile.uid);
  const [picked, setPicked] = useState<string | null>(null);

  const list = habits.data ?? [];
  const habit = list.find((h) => h.id === picked) ?? list[0];

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
          <div className="mb-3.5 flex gap-2 overflow-x-auto pb-1.5" role="group" aria-label="Choose a habit">
            {list.map((h) => {
              const on = h.id === habit.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(h.id)}
                  style={{ "--hc": h.color } as React.CSSProperties}
                  className={`flex-none rounded-full border-[1.5px] px-3.5 py-2 text-sm ${
                    on ? "border-(--hc) bg-(--hc) font-bold text-white" : "border-line bg-surface font-medium"
                  }`}
                >
                  {h.name}
                </button>
              );
            })}
          </div>
          <HabitProgress key={habit.id} uid={profile.uid} habit={habit} timezone={profile.timezone} />
        </>
      )}
    </>
  );
}

function HabitProgress({ uid, habit, timezone }: { uid: string; habit: Habit; timezone: string }) {
  const today = useLocalToday(timezone);
  const current = monthOf(today);
  const [month, setMonth] = useState<Month>(current);
  const { lead, dates } = monthDays(month);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;

  const checkIns = useCheckInDays(uid, [habit.id], from, to);
  const freezes = useCheckInDays(uid, [habit.id], from, to, "freezeUses");
  const done = new Set(checkIns.data?.[habit.id] ?? []);
  const frozen = new Set(freezes.data?.[habit.id] ?? []);

  // Nothing to see before the habit existed or after this month.
  const created = habit.createdAt ? monthOf(localToday(timezone, habit.createdAt.toDate())) : current;
  const atStart = compareMonths(month, created) <= 0;
  const atEnd = compareMonths(month, current) >= 0;

  return (
    <div className="grid gap-3.5 desk:grid-cols-[260px_minmax(0,1fr)] desk:items-start desk:gap-5">
      <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-1">
        <Tile label="Current streak" icon={<Flame className="size-4!" />} value={habit.currentStreak} />
        <Tile
          label="Best streak"
          icon={<StarIcon className="size-4 text-flame" />}
          value={habit.bestStreak}
        />
      </div>

      <section
        className="max-w-[620px] rounded-[20px] bg-surface p-4 shadow-card"
        style={{ "--hc": habit.color } as React.CSSProperties}
        aria-labelledby="month-title"
      >
        <div className="mb-2.5 flex items-center justify-between">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border-[1.5px] border-line disabled:opacity-30"
            aria-label="Previous month"
            disabled={atStart}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft />
          </button>
          <h2 id="month-title" className="text-lg" aria-live="polite">
            {monthLabel(month)}
          </h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border-[1.5px] border-line disabled:opacity-30"
            aria-label="Next month"
            disabled={atEnd}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight />
          </button>
        </div>

        {checkIns.error || freezes.error ? (
          <ErrorCard
            message="We could not load this month."
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
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {dates.map((d) => {
              const isDone = done.has(d);
              const isFrozen = !isDone && frozen.has(d);
              const status = isDone ? "done" : isFrozen ? "streak freeze used" : d > today ? "upcoming" : "not done";
              return (
                <div
                  key={d}
                  title={isFrozen ? "Streak freeze used" : undefined}
                  aria-label={`${Number(d.slice(8))}: ${status}`}
                  className={`mx-auto grid aspect-square w-full place-items-center rounded-full text-[13px] tabular-nums desk:max-w-[60px] ${
                    isDone
                      ? "bg-(--hc) font-bold text-white"
                      : isFrozen
                        ? "border-2 border-dashed border-(--hc) text-muted"
                        : "text-muted"
                  } ${d === today ? "shadow-[0_0_0_2px_var(--ink)]" : ""} ${d > today ? "opacity-35" : ""}`}
                >
                  {Number(d.slice(8))}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
          <LockIcon className="mt-0.5 size-4 flex-none" />
          <span>Past days are locked. Streaks are worked out on the server, so they cannot be edited here.</span>
        </p>
      </section>
    </div>
  );
}

function Tile({ label, icon, value }: { label: string; icon: React.ReactNode; value: number }) {
  return (
    <div className="rounded-[18px] bg-surface px-4 py-3.5 shadow-card">
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        {icon}
        {label}
      </span>
      <b className="font-display text-[38px] leading-[1.1] font-extrabold tabular-nums">{value}</b>
      <small className="ml-1 text-sm text-muted">{value === 1 ? "day" : "days"}</small>
    </div>
  );
}
