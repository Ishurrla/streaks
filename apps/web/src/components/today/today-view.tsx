"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { HabitSheet, createHabit, HABIT_IDEAS, nextColor, type SheetState } from "@/components/habits/habit-sheet";
import { CheckIcon, Flame, LockIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { ErrorCard, LoadingCards } from "@/components/views/states";
import { ApiError } from "@/lib/api";
import { callCheckIn, callUndoCheckIn, useCheckInDays, useHabits, type Habit } from "@/lib/data";
import { addDays, greeting, longDate, useLocalToday, weekdayShort } from "@/lib/dates";
import { burst, rain } from "@/lib/fx";
import { useProfile } from "@/lib/profile";

/** What the user asked for while the server has not confirmed it yet. */
type Pending = Record<string, { done: boolean; settled: boolean }>;

const RING = 251.3; // 2πr for r = 40

export function TodayView() {
  const profile = useProfile();
  const toast = useToast();
  const today = useLocalToday(profile.timezone);
  const habits = useHabits(profile.uid);
  const list = habits.data ?? [];
  const days = useCheckInDays(
    profile.uid,
    list.map((h) => h.id),
    addDays(today, -6),
    today,
  );

  const [pending, setPending] = useState<Pending>({});
  const [popId, setPopId] = useState<string | null>(null);
  const [entering, setEntering] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [celebrate, setCelebrate] = useState(false);

  // After a move west the local date can be one the rollover already closed.
  const locked = !!profile.lastClosedDate && today <= profile.lastClosedDate;

  const serverDone = (id: string) => days.data?.[id]?.includes(today) ?? false;
  const isDone = (id: string) => pending[id]?.done ?? serverDone(id);

  // Drop confirmed overrides once the live snapshot agrees with them.
  const stale = Object.keys(pending).filter((id) => pending[id]!.settled && serverDone(id) === pending[id]!.done);
  if (stale.length) {
    setPending((p) => {
      const next = { ...p };
      stale.forEach((id) => delete next[id]);
      return next;
    });
  }

  // Latest state for mutation callbacks, which run after this render.
  const latest = useRef({ list, isDone });
  useEffect(() => {
    latest.current = { list, isDone };
  });

  const mutation = useMutation({
    mutationFn: ({ habit, done }: { habit: Habit; done: boolean }) =>
      done ? callCheckIn(habit.id) : callUndoCheckIn(habit.id),
    onSuccess: (result, { habit, done }) => {
      setPending((p) => (p[habit.id] ? { ...p, [habit.id]: { done, settled: true } } : p));
      if (!done) return;
      const { list: all, isDone: doneNow } = latest.current;
      if (all.length > 0 && all.every((h) => h.id === habit.id || doneNow(h.id))) {
        setCelebrate(true);
        rain();
      } else {
        const c = result.currentStreak;
        toast(c > 1 ? `${c} days in a row. Keep it going.` : "Day one. That is how every streak starts.");
      }
    },
    onError: (error, { habit }) => {
      setPending((p) => {
        const next = { ...p };
        delete next[habit.id];
        return next;
      });
      toast(
        error instanceof ApiError && error.code === "failed-precondition"
          ? "That day has already closed. Check-ins open again at midnight."
          : "Could not save that check-in. Try again.",
      );
    },
  });

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(false), 5000);
    return () => clearTimeout(t);
  }, [celebrate]);

  useEffect(() => {
    if (!popId) return;
    const t = setTimeout(() => setPopId(null), 900);
    return () => clearTimeout(t);
  }, [popId]);

  function toggle(habit: Habit, e: MouseEvent<HTMLButtonElement>) {
    if (locked) {
      toast("That day has already closed. Check-ins open again at midnight.");
      return;
    }
    if (pending[habit.id] && !pending[habit.id]!.settled) return; // one request at a time per habit
    const done = !isDone(habit.id);
    setPending((p) => ({ ...p, [habit.id]: { done, settled: false } }));
    if (done) {
      setPopId(habit.id);
      const r = e.currentTarget.getBoundingClientRect();
      burst(r.left + 36, r.top + r.height / 2, habit.color);
    }
    mutation.mutate({ habit, done });
  }

  async function quickAdd(name: string) {
    try {
      const id = await createHabit(profile.uid, name, nextColor(list.length));
      setEntering((s) => new Set(s).add(id));
      toast("Added. Tap the circle when you have done it.");
    } catch {
      toast("Could not add that habit. Try again.");
    }
  }

  const total = list.length;
  const doneCount = list.filter((h) => isDone(h.id)).length;
  const allDone = total > 0 && doneCount === total;
  const atRisk = (h: Habit) => !isDone(h.id) && h.currentStreak > 0;
  const top = list.reduce<Habit | null>((a, h) => (!a || h.currentStreak > a.currentStreak ? h : a), null);
  const topStreak = top?.currentStreak ?? 0;

  const subtitle =
    total === 0
      ? "Add your first habit to get going."
      : allDone
        ? "All done for today. See you tomorrow."
        : doneCount === 0
          ? "A fresh day. Pick one small thing to start."
          : `${total - doneCount} to go. You are on a roll.`;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[1.1] font-extrabold [overflow-wrap:anywhere] desk:text-4xl">
            {greeting(profile.timezone)}, {profile.name}
          </h1>
          <p className="mt-1.5 text-muted">
            {longDate(today)}. {habits.data ? subtitle : ""}
          </p>
        </div>
        <div
          className="grid size-[42px] flex-none place-items-center rounded-full bg-accent font-display font-extrabold text-accent-ink"
          aria-hidden="true"
        >
          {profile.name.charAt(0).toUpperCase()}
        </div>
      </div>

      {locked && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-flame-soft px-3.5 py-3 text-sm" role="status">
          <LockIcon className="size-[22px] flex-none" />
          <span>Today already closed in your old time zone. Check-ins open again at midnight.</span>
        </div>
      )}

      {habits.error || days.error ? (
        <ErrorCard
          message="We could not load your habits."
          onRetry={() => {
            habits.retry();
            days.retry();
          }}
        />
      ) : habits.isLoading || (total > 0 && days.isLoading) ? (
        <LoadingCards />
      ) : total === 0 ? (
        <EmptyToday onQuickAdd={quickAdd} onWriteOwn={() => setSheet({ mode: "new" })} />
      ) : (
        <div className="grid gap-[18px] [grid-template-areas:'side''list'] desk:grid-cols-[minmax(0,1fr)_340px] desk:items-start desk:gap-7 desk:[grid-template-areas:'list_side']">
          <div className="[grid-area:side] desk:sticky desk:top-9">
            <div className="flex items-center gap-[18px] rounded-[22px] bg-surface p-[18px] shadow-card">
              <div
                className={`progress-ring ${allDone ? "full" : ""} ${celebrate ? "pulse" : ""}`}
                role="img"
                aria-label={`${doneCount} of ${total} habits done today`}
              >
                <svg viewBox="0 0 96 96">
                  <circle className="track" cx="48" cy="48" r="40" fill="none" strokeWidth="10" />
                  <circle
                    className="bar"
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    strokeDashoffset={RING * (1 - doneCount / total)}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center font-display text-2xl font-extrabold tabular-nums">
                  <div>
                    {doneCount}/{total}
                    <small className="-mt-1 block text-center font-body text-[11px] font-medium text-muted">done</small>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <Flame live={topStreak > 0} />
                {/* A long habit name wraps here instead of widening the whole Today grid. */}
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <b className="block font-display text-xl leading-[1.1]">
                    {topStreak > 0 ? `${topStreak} day streak` : "No streak yet"}
                  </b>
                  <span className="text-sm text-muted">{topStreak > 0 ? top!.name : "Check one off to start"}</span>
                </div>
              </div>
            </div>
            <WeekStrip today={today} habits={list} days={days.data ?? {}} isDone={isDone} />
          </div>

          <div className="[grid-area:list]">
            <h2 className="section-title">Today</h2>
            <div className="flex flex-col gap-2.5">
              {list.map((h) => (
                <HabitCard
                  key={h.id}
                  habit={h}
                  today={today}
                  done={isDone(h.id)}
                  saving={!!pending[h.id]}
                  atRisk={atRisk(h)}
                  pop={popId === h.id}
                  enter={entering.has(h.id)}
                  onToggle={(e) => toggle(h, e)}
                />
              ))}
            </div>
            <button className="btn btn-ghost mt-3.5 w-full" type="button" onClick={() => setSheet({ mode: "new" })}>
              + Add a habit
            </button>
            {allDone ? (
              <Banner>Every habit checked off. Your streaks are safe until midnight.</Banner>
            ) : list.some(atRisk) ? (
              <Banner>Some streaks are waiting on you. One check-in per day keeps them alive.</Banner>
            ) : null}
          </div>
        </div>
      )}

      <HabitSheet
        uid={profile.uid}
        state={sheet}
        habitCount={total}
        onClose={() => setSheet(null)}
        onCreated={(id) => setEntering((s) => new Set(s).add(id))}
      />

      <Sheet open={celebrate} onClose={() => setCelebrate(false)} labelledBy="celebrate-title" className="celeb">
        <Flame className="bigflame" />
        <h2 id="celebrate-title">All done for today</h2>
        <p className="text-muted">Every habit checked off. Your streaks are safe until midnight.</p>
        <div className="mt-[18px] mb-[22px] flex justify-center gap-7">
          <div>
            <b className="block font-display text-[30px] leading-[1.1]">
              {total}/{total}
            </b>
            <span className="text-[13px] text-muted">habits done</span>
          </div>
          <div>
            <b className="block font-display text-[30px] leading-[1.1]">{topStreak}</b>
            <span className="text-[13px] text-muted">day top streak</span>
          </div>
        </div>
        <button className="btn btn-block" type="button" onClick={() => setCelebrate(false)} autoFocus>
          Nice
        </button>
      </Sheet>
    </>
  );
}

function HabitCard({
  habit,
  today,
  done,
  saving,
  atRisk,
  pop,
  enter,
  onToggle,
}: {
  habit: Habit;
  today: string;
  done: boolean;
  saving: boolean;
  atRisk: boolean;
  pop: boolean;
  enter: boolean;
  onToggle: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  // The stats come from the server. They match what is on screen only once the habit
  // doc reflects today's state; until then say so rather than guess a number.
  const fresh = done ? habit.lastCheckInDate === today : habit.lastCheckInDate !== today;
  const c = habit.currentStreak;

  let line: React.ReactNode;
  let tone = "";
  if (saving && !fresh) {
    line = "Saving…";
  } else if (done) {
    line = c > 0 ? (
      <>
        <Flame />
        {c} day streak
      </>
    ) : null;
    tone = c > 1 ? "hot" : "";
  } else if (atRisk) {
    line = (
      <>
        <Flame />
        Keep your {c} day streak
      </>
    );
    tone = "risk";
  } else {
    line = "Start a streak today";
  }

  return (
    <button
      type="button"
      className={`habit-card ${done ? "done" : ""} ${pop ? "pop" : ""} ${enter ? "enter" : ""}`}
      style={{ "--hc": habit.color } as React.CSSProperties}
      aria-pressed={done}
      onClick={onToggle}
    >
      <span className="check">
        <CheckIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="name">{habit.name}</span>
        <span key={`${done}-${c}-${saving && !fresh}`} className={`streak-line ${tone}`}>
          {line}
        </span>
      </span>
    </button>
  );
}

function WeekStrip({
  today,
  habits,
  days,
  isDone,
}: {
  today: string;
  habits: Habit[];
  days: Record<string, string[]>;
  isDone: (id: string) => boolean;
}) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <div className="mt-3.5 rounded-[22px] bg-surface px-[18px] py-4 shadow-card">
      <h2 className="section-title m-0!">This week</h2>
      <ol className="mt-3 flex justify-between">
        {week.map((d) => {
          const count = habits.filter((h) => (d === today ? isDone(h.id) : days[h.id]?.includes(d))).length;
          const pct = habits.length ? Math.round((count / habits.length) * 100) : 0;
          return (
            <li
              key={d}
              className={`flex flex-col items-center gap-1.5 text-xs ${d === today ? "font-bold text-ink" : "text-muted"}`}
              aria-label={`${weekdayShort(d)}: ${count} of ${habits.length} done`}
            >
              <i className="relative block size-[30px] overflow-hidden rounded-full bg-line">
                <b className="absolute inset-x-0 bottom-0 bg-accent transition-[height] duration-500" style={{ height: `${pct}%` }} />
              </i>
              <span aria-hidden="true">{weekdayShort(d)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-flame-soft px-3.5 py-3 text-sm">
      <Flame live className="size-[22px]!" />
      <span>{children}</span>
    </div>
  );
}

function EmptyToday({ onQuickAdd, onWriteOwn }: { onQuickAdd: (name: string) => void; onWriteOwn: () => void }) {
  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl bg-surface px-[22px] py-[34px] text-center shadow-card">
      <Flame live className="size-16!" />
      <h2 className="max-w-[18ch] text-[26px]">What do you want to do every day?</h2>
      <p className="max-w-[36ch] text-muted">Start with one or two small habits. You can change them any time.</p>
      <div className="mt-1.5 mb-2.5 flex flex-wrap justify-center gap-2">
        {HABIT_IDEAS.map((idea) => (
          <button key={idea} className="idea" type="button" onClick={() => onQuickAdd(idea)}>
            + {idea}
          </button>
        ))}
      </div>
      <button className="btn" type="button" onClick={onWriteOwn}>
        Write my own
      </button>
    </div>
  );
}
