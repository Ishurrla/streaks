"use client";

import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useState, type FormEvent } from "react";
import { CheckIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { callDeleteHabit, habitsRef, type Habit } from "@/lib/data";
import { HABIT_COLORS } from "@/lib/types";

export const HABIT_IDEAS = [
  "Read for 20 minutes",
  "Go for a walk",
  "Drink 2 litres of water",
  "Stretch for 5 minutes",
  "Write in a journal",
  "Meditate for 10 minutes",
];

export type SheetState = { mode: "new" } | { mode: "edit"; habit: Habit } | null;

/** Creates a habit with zeroed stats, which is the only shape the rules accept. */
export async function createHabit(uid: string, name: string, color: string): Promise<string> {
  const ref = doc(habitsRef(uid));
  await setDoc(ref, {
    name: name.trim(),
    color,
    createdAt: serverTimestamp(),
    currentStreak: 0,
    bestStreak: 0,
    lastCheckInDate: null,
  });
  return ref.id;
}

export function nextColor(habitCount: number): string {
  return HABIT_COLORS[habitCount % HABIT_COLORS.length]!;
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
          key={state.mode === "edit" ? state.habit.id : "new"}
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
  const editing = state.mode === "edit" ? state.habit : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<string>(editing?.color ?? nextColor(habitCount));
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
    setBusy(true);
    try {
      if (editing) {
        await updateDoc(doc(habitsRef(uid), editing.id), { name: trimmed, color });
      } else {
        onCreated?.(await createHabit(uid, trimmed, color));
      }
      onClose();
      toast("Saved.");
    } catch {
      setBusy(false);
      toast("Could not save that habit. Try again.");
    }
  }

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

  return (
    <form onSubmit={save} noValidate>
      <h2 id="habit-sheet-title">{editing ? "Edit habit" : "New habit"}</h2>
      <label className="field-label" htmlFor="habit-name">
        What will you do every day?
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
            <button className="btn flex-1" type="submit" disabled={busy}>
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
}
