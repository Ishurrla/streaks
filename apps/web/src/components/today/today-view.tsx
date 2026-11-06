"use client";

import {
  DAY_NAMES,
  daysOn,
  describeDays,
  isEveryDay,
  nextScheduledAfter,
  scheduledOn,
  weekdayOf,
} from "@streaks/core/schedule";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { HabitSheet, createHabit, HABIT_IDEAS, nextColor, PendingDays, type SheetState } from "@/components/habits/habit-sheet";
import { CalendarIcon, CheckIcon, Flame, InfoIcon, LockIcon, MoonIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { ErrorCard, LoadingCards } from "@/components/views/states";
import { ApiError } from "@/lib/api";
import { callCheckIn, callUndoCheckIn, useCheckInDays, useHabitCache, useHabits, type Habit } from "@/lib/data";
import { addDays, greeting, longDate, useLocalToday, weekdayShort } from "@/lib/dates";
import { burst, rain } from "@/lib/fx";
import { useProfile } from "@/lib/profile";
import { MilestoneCelebration, type MilestoneHit } from "./milestone-celebration";

/** What the user asked for while the server has not confirmed it yet. */
type Pending = Record<string, { done: boolean; settled: boolean }>;

const RING = 251.3; // 2πr for r = 40

/** "12 day streak" for an every-day habit, "12 in a row" for one with rest days. */
export function streakText(habit: Habit, today: string, n = habit.currentStreak): string {
  return isEveryDay(daysOn(habit, today)) ? `${n} day streak` : `${n} in a row`;
}

/** The toast for a check-in or undo the server refused. */
function checkInErrorMessage(code: string | null, habitName: string): string {
  if (code === "NOT_SCHEDULED") return `${habitName} rests today. Your streak is safe.`;
  if (code === "failed-precondition") return "That day has already closed. Check-ins open again at midnight.";
  return "Could not save that check-in. Try again.";
}

/** The line under the greeting, from how many habits there are, are due, and are done. */
function todaySubtitle(habitCount: number, dueCount: number, doneCount: number): string {
  if (habitCount === 0) return "Add your first habit to get going.";
  if (dueCount === 0) return "Nothing due today. Enjoy the rest day.";
  if (doneCount === dueCount) return "All done for today. See you tomorrow.";
  if (doneCount === 0) return "A fresh day. Pick one small thing to start.";
  return `${dueCount - doneCount} to go. You are on a roll.`;
}

/** The habit with the longest current streak (the first, on a tie), or null. */
function topHabit(habits: Habit[]): Habit | null {
  return habits.reduce<Habit | null>((a, h) => (!a || h.currentStreak > a.currentStreak ? h : a), null);
}

export function TodayView() {
  const profile = useProfile();
  const toast = useToast();
  const today = useLocalToday(profile.timezone);
  const habits = useHabits(profile.uid);
  const cache = useHabitCache(profile.uid);
  const list = habits.data ?? [];
  // Which habits are due is decided by the same scheduledOn the server uses.
  const due = list.filter((h) => scheduledOn(h, today));
  const resting = list.filter((h) => !scheduledOn(h, today));
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
  const [milestone, setMilestone] = useState<MilestoneHit | null>(null);

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
  const latest = useRef({ due, isDone });
  useEffect(() => {
    latest.current = { due, isDone };
  });

  const mutation = useMutation({
    mutationFn: ({ habit, done }: { habit: Habit; done: boolean }) =>
      done ? callCheckIn(habit.id) : callUndoCheckIn(habit.id),
    onSuccess: (result, { habit, done }) => {
      setPending((p) => (p[habit.id] ? { ...p, [habit.id]: { done, settled: true } } : p));
      cache.afterCheckIn(habit.id, result, done);
      if (!done || !result.changed) return;
      // A milestone is celebrated only when the server says this check-in earned it.
      if (result.milestoneReached !== null) {
        setMilestone({ habit, milestone: result.milestoneReached });
        rain();
        return;
      }
      const { due: dueNow, isDone: doneNow } = latest.current;
      if (dueNow.length > 0 && dueNow.every((h) => h.id === habit.id || doneNow(h.id))) {
        setCelebrate(true);
        rain();
      } else {
        const c = result.currentStreak;
        toast(c > 1 ? `${streakText(habit, today, c)}. Keep it going.` : "Day one. That is how every streak starts.");
      }
    },
    onError: (error, { habit }) => {
      setPending((p) => {
        const next = { ...p };
        delete next[habit.id];
        return next;
      });
      toast(checkInErrorMessage(error instanceof ApiError ? error.code : null, habit.name));
    },
  });

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

  // The ring, the counts and the all-done state are about today's due habits only.
  const total = due.length;
  const doneCount = due.filter((h) => isDone(h.id)).length;
  const allDone = total > 0 && doneCount === total;
  const atRisk = (h: Habit) => scheduledOn(h, today) && !isDone(h.id) && h.currentStreak > 0;
  const top = topHabit(list);
  const topStreak = top?.currentStreak ?? 0;

  return (
    <>
      <TodayHeader
        name={profile.name}
        timezone={profile.timezone}
        today={today}
        subtitle={habits.data ? todaySubtitle(list.length, total, doneCount) : ""}
      />

      {locked && <ClosedNote />}

      <TodayContent
        error={!!(habits.error || days.error)}
        loading={habits.isLoading || (list.length > 0 && days.isLoading)}
        empty={list.length === 0}
        onRetry={() => {
          habits.retry();
          days.retry();
        }}
        onQuickAdd={quickAdd}
        onWriteOwn={() => setSheet({ mode: "new" })}
      >
        {/* Two columns only from 1180px: beside the sidebar, any earlier squeezes the habit cards. */}
        <div className="grid gap-4.5 [grid-template-areas:'side''list'] min-[1180px]:grid-cols-[minmax(0,1fr)_340px] min-[1180px]:items-start min-[1180px]:gap-7 min-[1180px]:[grid-template-areas:'list_side']">
          <TodaySummary
            today={today}
            habits={list}
            days={days.data ?? {}}
            isDone={isDone}
            doneCount={doneCount}
            total={total}
            allDone={allDone}
            pulse={celebrate}
            top={top}
          />
          <TodayLists
            today={today}
            due={due}
            resting={resting}
            isDone={isDone}
            saving={(id) => !!pending[id]}
            atRisk={atRisk}
            popId={popId}
            entering={entering}
            allDone={allDone}
            anyAtRisk={list.some(atRisk)}
            onToggle={toggle}
            onRest={(h) => toast(`${h.name} rests today. Your streak is safe.`)}
            onChangeDays={(h) => setSheet({ mode: "days", habit: h })}
            onAdd={() => setSheet({ mode: "new" })}
          />
        </div>
      </TodayContent>

      <HabitSheet
        uid={profile.uid}
        state={sheet}
        habitCount={list.length}
        onClose={() => setSheet(null)}
        onCreated={(id) => setEntering((s) => new Set(s).add(id))}
      />

      <AllDoneCelebration open={celebrate} total={total} topStreak={topStreak} onClose={() => setCelebrate(false)} />

      <MilestoneCelebration hit={milestone} today={today} onClose={() => setMilestone(null)} />
    </>
  );
}

function TodayHeader({ name, timezone, today, subtitle }: { name: string; timezone: string; today: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.1] font-extrabold wrap-anywhere desk:text-4xl">
          {greeting(timezone)}, {name}
        </h1>
        <p className="mt-1.5 text-muted">
          {longDate(today)}. {subtitle}
        </p>
      </div>
      <div
        className="grid size-10.5 flex-none place-items-center rounded-full bg-accent font-display font-extrabold text-accent-ink"
        aria-hidden="true"
      >
        {name.charAt(0).toUpperCase()}
      </div>
    </div>
  );
}

/** Today already closed, after a move to an earlier time zone. <output> is the native role="status". */
function ClosedNote() {
  return (
    <output className="mb-4 flex items-center gap-2.5 rounded-2xl bg-flame-soft px-3.5 py-3 text-sm">
      <LockIcon className="size-5.5 flex-none" />
      <span>Today already closed in your old time zone. Check-ins open again at midnight.</span>
    </output>
  );
}

/** The main area: an error, still loading, the first-run state, or the habits. */
function TodayContent({
  error,
  loading,
  empty,
  onRetry,
  onQuickAdd,
  onWriteOwn,
  children,
}: {
  error: boolean;
  loading: boolean;
  empty: boolean;
  onRetry: () => void;
  onQuickAdd: (name: string) => void;
  onWriteOwn: () => void;
  children: React.ReactNode;
}) {
  if (error) return <ErrorCard message="We could not load your habits." onRetry={onRetry} />;
  if (loading) return <LoadingCards />;
  if (empty) return <EmptyToday onQuickAdd={onQuickAdd} onWriteOwn={onWriteOwn} />;
  return <>{children}</>;
}

/** The side column: the progress ring, the top streak, the week, and a note about rest days. */
function TodaySummary({
  today,
  habits,
  days,
  isDone,
  doneCount,
  total,
  allDone,
  pulse,
  top,
}: {
  today: string;
  habits: Habit[];
  days: Record<string, string[]>;
  isDone: (id: string) => boolean;
  doneCount: number;
  total: number;
  allDone: boolean;
  pulse: boolean;
  top: Habit | null;
}) {
  const topStreak = top?.currentStreak ?? 0;
  return (
    <div className="[grid-area:side] min-[1180px]:sticky min-[1180px]:top-9">
      <div className="flex items-center gap-4.5 rounded-[22px] bg-surface p-4.5 shadow-card">
        <div
          className={`progress-ring ${allDone ? "full" : ""} ${pulse ? "pulse" : ""}`}
          role="img"
          aria-label={`${doneCount} of ${total} habits due today done`}
        >
          {/* Drawn only: the label above says what it shows. */}
          <svg viewBox="0 0 96 96" aria-hidden="true">
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
              strokeDashoffset={RING * (1 - (total ? doneCount / total : 0))}
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
          <div className="min-w-0 wrap-anywhere">
            <b className="block font-display text-xl leading-[1.1]">
              {top && topStreak > 0 ? streakText(top, today) : "No streak yet"}
            </b>
            <span className="text-sm text-muted">{top && topStreak > 0 ? top.name : "Check one off to start"}</span>
          </div>
        </div>
      </div>
      <WeekStrip today={today} habits={habits} days={days} isDone={isDone} />
      {habits.some((h) => !isEveryDay(daysOn(h, today))) && (
        <p className="mt-3.5 flex items-start gap-2 rounded-[14px] bg-surface px-3.5 py-3 text-[13px] text-muted shadow-card">
          <InfoIcon className="mt-px size-4.5 flex-none text-accent" />
          <span>
            Streaks count scheduled days only. On a rest day the habit can&apos;t be checked in and the streak stays
            safe.
          </span>
        </p>
      )}
    </div>
  );
}

/** The main column: today's due habits, the ones resting, adding one, and a word of encouragement. */
function TodayLists({
  today,
  due,
  resting,
  isDone,
  saving,
  atRisk,
  popId,
  entering,
  allDone,
  anyAtRisk,
  onToggle,
  onRest,
  onChangeDays,
  onAdd,
}: {
  today: string;
  due: Habit[];
  resting: Habit[];
  isDone: (id: string) => boolean;
  saving: (id: string) => boolean;
  atRisk: (habit: Habit) => boolean;
  popId: string | null;
  entering: Set<string>;
  allDone: boolean;
  anyAtRisk: boolean;
  onToggle: (habit: Habit, e: MouseEvent<HTMLButtonElement>) => void;
  onRest: (habit: Habit) => void;
  onChangeDays: (habit: Habit) => void;
  onAdd: () => void;
}) {
  return (
    <div className="[grid-area:list]">
      <h2 className="section-title">Due today</h2>
      <div className="flex flex-col gap-2.5">
        {due.length === 0 && <p className="px-1.5 text-sm text-muted">Nothing due today. Enjoy the rest day.</p>}
        {due.map((h) => (
          <HabitCard
            key={h.id}
            habit={h}
            today={today}
            done={isDone(h.id)}
            saving={saving(h.id)}
            atRisk={atRisk(h)}
            pop={popId === h.id}
            enter={entering.has(h.id)}
            onToggle={(e) => onToggle(h, e)}
            onChangeDays={() => onChangeDays(h)}
          />
        ))}
      </div>
      {resting.length > 0 && (
        <>
          <h2 className="section-title mt-5!">Resting today</h2>
          <div className="flex flex-col gap-2.5">
            {resting.map((h) => (
              <RestCard key={h.id} habit={h} today={today} onTap={() => onRest(h)} onChangeDays={() => onChangeDays(h)} />
            ))}
          </div>
        </>
      )}
      <button className="btn btn-ghost mt-3.5 w-full" type="button" onClick={onAdd}>
        + Add a habit
      </button>
      <StatusBanner allDone={allDone} anyAtRisk={anyAtRisk} />
    </div>
  );
}

/** Under the lists: all done, or some streaks still waiting on today. */
function StatusBanner({ allDone, anyAtRisk }: { allDone: boolean; anyAtRisk: boolean }) {
  if (allDone) return <Banner>Every habit checked off. Your streaks are safe until midnight.</Banner>;
  if (anyAtRisk) return <Banner>Some streaks are waiting on you. One check-in per day keeps them alive.</Banner>;
  return null;
}

function AllDoneCelebration({ open, total, topStreak, onClose }: { open: boolean; total: number; topStreak: number; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="celebrate-title" className="celeb">
      <Flame className="bigflame" />
      <h2 id="celebrate-title">All done for today</h2>
      <p className="text-muted">Every habit checked off. Your streaks are safe until midnight.</p>
      <div className="mt-4.5 mb-5.5 flex justify-center gap-7">
        <div>
          <b className="block font-display text-[30px] leading-[1.1]">
            {total}/{total}
          </b>
          <span className="text-[13px] text-muted">habits done</span>
        </div>
        <div>
          <b className="block font-display text-[30px] leading-[1.1]">{topStreak}</b>
          <span className="text-[13px] text-muted">top streak</span>
        </div>
      </div>
      {/* The dialog focuses its first (and only) button on opening, so no autoFocus. */}
      <button className="btn btn-block" type="button" onClick={onClose}>
        Nice
      </button>
    </Sheet>
  );
}

/** A habit card's streak line and its tone ("hot" or "risk"), from where the card stands. */
function streakLine(
  habit: Habit,
  today: string,
  { done, saving, fresh, atRisk }: { done: boolean; saving: boolean; fresh: boolean; atRisk: boolean },
): { line: React.ReactNode; tone: string } {
  const c = habit.currentStreak;
  if (saving && !fresh) return { line: "Saving…", tone: "" };
  if (done) {
    const line = c > 0 ? (
      <>
        <Flame />
        {streakText(habit, today)}
      </>
    ) : null;
    return { line, tone: c > 1 ? "hot" : "" };
  }
  if (atRisk) {
    const text = isEveryDay(daysOn(habit, today)) ? `Keep your ${c} day streak` : streakText(habit, today);
    return {
      line: (
        <>
          <Flame />
          {text}
        </>
      ),
      tone: "risk",
    };
  }
  return { line: "Start a streak today", tone: "" };
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
  onChangeDays,
}: {
  habit: Habit;
  today: string;
  done: boolean;
  saving: boolean;
  atRisk: boolean;
  pop: boolean;
  enter: boolean;
  onToggle: (e: MouseEvent<HTMLButtonElement>) => void;
  onChangeDays: () => void;
}) {
  // The stats come from the server. They match what is on screen only once the habit
  // doc reflects today's state; until then say so rather than guess a number.
  const fresh = done ? habit.lastCheckInDate === today : habit.lastCheckInDate !== today;
  const c = habit.currentStreak;
  const { line, tone } = streakLine(habit, today, { done, saving, fresh, atRisk });

  return (
    <div className="habit-row">
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
          <span className="card-when">{describeDays(daysOn(habit, today))}</span>
          <PendingDays habit={habit} today={today} />
        </span>
      </button>
      <ChangeDaysButton habit={habit} onClick={onChangeDays} />
    </div>
  );
}

/** A habit resting today: not a check-off target. Tapping it only says the streak is safe. */
function RestCard({
  habit,
  today,
  onTap,
  onChangeDays,
}: {
  habit: Habit;
  today: string;
  onTap: () => void;
  onChangeDays: () => void;
}) {
  const back = DAY_NAMES[weekdayOf(nextScheduledAfter(habit, today))];
  return (
    <div className="habit-row">
      <button
        type="button"
        className="habit-card rest"
        style={{ "--hc": habit.color } as React.CSSProperties}
        onClick={onTap}
      >
        <span className="check">
          <MoonIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="name">{habit.name}</span>
          <span className="streak-line">
            {habit.currentStreak > 0 ? `${streakText(habit, today)} · safe` : "Not started"}
          </span>
          <span className="card-when">Rest day, back on {back}</span>
          <PendingDays habit={habit} today={today} />
        </span>
      </button>
      <ChangeDaysButton habit={habit} onClick={onChangeDays} />
    </div>
  );
}

function ChangeDaysButton({ habit, onClick }: { habit: Habit; onClick: () => void }) {
  return (
    <button type="button" className="iconbtn" aria-label={`Change days for ${habit.name}`} onClick={onClick}>
      <CalendarIcon />
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
    <div className="mt-3.5 rounded-[22px] bg-surface px-4.5 py-4 shadow-card">
      <h2 className="section-title m-0!">This week</h2>
      <ol className="mt-3 flex justify-between">
        {week.map((d) => {
          // Each day counts the habits scheduled on it then, so a past week keeps its old days.
          const dueThen = habits.filter((h) => scheduledOn(h, d));
          const count = dueThen.filter((h) => (d === today ? isDone(h.id) : days[h.id]?.includes(d))).length;
          const pct = dueThen.length ? Math.round((count / dueThen.length) * 100) : 0;
          const state = dueThen.length ? `${count} of ${dueThen.length} done` : "rest day";
          return (
            <li
              key={d}
              className={`flex flex-col items-center gap-1.5 text-xs ${d === today ? "font-bold text-ink" : "text-muted"}`}
              aria-label={`${weekdayShort(d)}: ${state}`}
            >
              <i
                className={`relative block size-7.5 overflow-hidden rounded-full ${
                  dueThen.length ? "bg-line" : "border-[1.5px] border-dashed border-line"
                }`}
              >
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
      <Flame live className="size-5.5!" />
      <span>{children}</span>
    </div>
  );
}

function EmptyToday({ onQuickAdd, onWriteOwn }: { onQuickAdd: (name: string) => void; onWriteOwn: () => void }) {
  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl bg-surface px-5.5 py-8.5 text-center shadow-card">
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
