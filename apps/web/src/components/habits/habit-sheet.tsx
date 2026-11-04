"use client";

import { ALL_DAYS, daysOn, describeDays, hasPendingDays } from "@streaks/core/schedule";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { CheckIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { callDeleteHabit, callUpdateHabitDays, habitsRef, useHabitCache, type Habit } from "@/lib/data";
import { useLocalToday } from "@/lib/dates";
import { useProfile } from "@/lib/profile";
import { HABIT_COLORS } from "@/lib/types";
import { DayPicker } from "./day-picker";

export const HABIT_IDEAS = [
  "Read for 20 minutes",
  "Go for a walk",
  "Drink 2 litres of water",
  "Stretch for 5 minutes",
  "Write in a journal",
  "Meditate for 10 minutes",
];

/** "new" and "edit" are the full sheet; "days" is only the Change days picker. */
export type SheetState = { mode: "new" } | { mode: "edit"; habit: Habit } | { mode: "days"; habit: Habit } | null;

/**
 * Creates a habit with zeroed stats and no milestones, the only shape the rules accept.
 * `days` can be set only here; later changes go through /api/update-habit-days.
 */
export async function createHabit(
  uid: string,
  name: string,
  color: string,
  days: readonly number[] = ALL_DAYS,
): Promise<string> {
  const ref = doc(habitsRef(uid));
  await setDoc(ref, {
    name: name.trim(),
    color,
    createdAt: serverTimestamp(),
    currentStreak: 0,
    bestStreak: 0,
    lastCheckInDate: null,
    days: [...days],
    milestonesEarned: [],
  });
  return ref.id;
}

export function nextColor(habitCount: number): string {
  return HABIT_COLORS[habitCount % HABIT_COLORS.length]!;
}

/** The days a habit will have from tomorrow: a pending change, or the days in force today. */
export function upcomingDays(habit: Habit, today: string): number[] {
  return hasPendingDays(habit, today) ? habit.nextDays : daysOn(habit, today);
}

/** "New days start tomorrow: Mon · Wed · Fri", or nothing without a pending change. */
export function PendingDays({ habit, today, className = "" }: { habit: Habit; today: string; className?: string }) {
  if (!hasPendingDays(habit, today)) return null;
  return <span className={`pending-days ${className}`}>New days start tomorrow: {describeDays(habit.nextDays)}</span>;
}

export function HabitSheet({
  uid,
  state,
  habitCount,
  onClose,
  onCreated,
}: {
  uid: string;
  state: SheetState;
  habitCount: number;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  return (
    <Sheet open={state !== null} onClose={onClose} labelledBy="habit-sheet-title">
      {state && (
        <HabitForm
          key={state.mode === "new" ? "new" : `${state.mode}-${state.habit.id}`}
          uid={uid}
          state={state}
          habitCount={habitCount}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </Sheet>
  );
}

function HabitForm({
  uid,
  state,
  habitCount,
  onClose,
  onCreated,
}: {
  uid: string;
  state: NonNullable<SheetState>;
  habitCount: number;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const toast = useToast();
  const profile = useProfile();
  const today = useLocalToday(profile.timezone);
  const cache = useHabitCache(uid);
  const editing = state.mode === "new" ? null : state.habit;
  const daysOnly = state.mode === "days";
  const [startDays] = useState<number[]>(() => (editing ? upcomingDays(editing, today) : [...ALL_DAYS]));
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<string>(editing?.color ?? nextColor(habitCount));
  const [days, setDays] = useState<number[]>(startDays);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your habit a name.");
      document.getElementById("habit-name")?.focus();
      return;
    }
    if (days.length === 0) return; // the picker already says "Pick at least one day."
    const daysChanged = days.length !== startDays.length || days.some((d) => !startDays.includes(d));
    setBusy(true);
    try {
      if (editing) {
        if (!daysOnly && (trimmed !== editing.name || color !== editing.color)) {
          await updateDoc(doc(habitsRef(uid), editing.id), { name: trimmed, color });
        }
        // The server stores the change to start tomorrow; show its answer straight away.
        if (daysChanged) cache.afterDaysChange(editing.id, await callUpdateHabitDays(editing.id, days));
      } else {
        // Not onCreated?.(await createHabit(...)): an optional call skips its arguments
        // when there is no callback, so the habit would never be created.
        const id = await createHabit(uid, trimmed, color, days);
        onCreated?.(id);
      }
      onClose();
      toast(editing && daysChanged ? "Saved. The new days start tomorrow." : editing ? "Saved." : "Habit added.");
    } catch {
      setBusy(false);
      toast("Could not save that habit. Try again.");
    }
  }

  const picker = <DayPicker days={days} onChange={setDays} color={color} changing={!!editing} />;
  const pending = editing ? <PendingDays habit={editing} today={today} className="mt-2" /> : null;
  const saveDisabled = busy || days.length === 0;

  if (daysOnly && editing) {
    return (
      <form onSubmit={save} noValidate>
        <h2 id="habit-sheet-title" className="mb-1!">
          Change days
        </h2>
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{editing.name}</p>
        {pending}
        {picker}
        <div className="mt-[22px] flex gap-2.5">
          <button className="btn btn-ghost flex-1" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn flex-1" type="submit" disabled={saveDisabled}>
            {busy ? "Saving…" : "Save days"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={save} noValidate>
      <h2 id="habit-sheet-title">{editing ? "Edit habit" : "New habit"}</h2>
      <label className="field-label" htmlFor="habit-name">
        What will you do?
      </label>
      <input
        id="habit-name"
        className="input"
        maxLength={40}
        placeholder="e.g. Read for 20 minutes"
        autoFocus
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "habit-name-error" : undefined}
      />
      {error && (
        <div id="habit-name-error" className="err">
          {error}
        </div>
      )}

      {!editing && (
        <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Ideas">
          {HABIT_IDEAS.slice(0, 4).map((idea) => (
            <button
              key={idea}
              className="idea"
              type="button"
              onClick={() => {
                setName(idea);
                setError(null);
              }}
            >
              {idea}
            </button>
          ))}
        </div>
      )}

      <div className="field-label" id="colour-label">
        Colour
      </div>
      <div className="flex gap-2.5" role="group" aria-labelledby="colour-label">
        {HABIT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            className="colour-swatch"
            style={{ "--hc": c } as React.CSSProperties}
            aria-pressed={color === c}
            aria-label={`Colour ${i + 1} of ${HABIT_COLORS.length}`}
            onClick={() => setColor(c)}
          >
            <CheckIcon />
          </button>
        ))}
      </div>

      {picker}
      {pending}

      {confirming && editing ? (
        <>
          <p className="mt-5 font-medium" role="alert">
            Remove this habit and its {editing.bestStreak} day best streak? This cannot be undone.
          </p>
          <div className="mt-[22px] flex gap-2.5">
            <button className="btn btn-ghost flex-1" type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
            <button className="btn btn-danger flex-1" type="button" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-[22px] flex gap-2.5">
            <button className="btn btn-ghost flex-1" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn flex-1" type="submit" disabled={saveDisabled}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add habit"}
            </button>
          </div>
          {editing && (
            <div className="mt-2.5 text-center">
              <button className="link text-danger!" type="button" onClick={() => setConfirming(true)}>
                Remove habit
              </button>
            </div>
          )}
        </>
      )}
    </form>
  );

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try {
      await callDeleteHabit(editing.id);
      onClose();
      toast("Habit removed.");
    } catch {
      setBusy(false);
      toast("Could not remove that habit. Try again.");
    }
  }
}
