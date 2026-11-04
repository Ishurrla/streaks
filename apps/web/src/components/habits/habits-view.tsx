"use client";

import { daysOn, describeDays } from "@streaks/core/schedule";
import { useState } from "react";
import { PageHead } from "@/components/views/page-head";
import { EmptyRow, ErrorCard, LoadingCards } from "@/components/views/states";
import { useAuth } from "@/lib/auth";
import { useHabits } from "@/lib/data";
import { useLocalToday } from "@/lib/dates";
import { useProfile } from "@/lib/profile";
import { HabitSheet, PendingDays, type SheetState } from "./habit-sheet";

export function HabitsView() {
  const profile = useProfile();
  const { state, logOut } = useAuth();
  const habits = useHabits(profile.uid);
  const today = useLocalToday(profile.timezone);
  const [sheet, setSheet] = useState<SheetState>(null);
  const email = state.status === "signedIn" ? state.user.email : null;

  return (
    <>
      <PageHead title="Your habits">
        <button className="btn" type="button" onClick={() => setSheet({ mode: "new" })}>
          Add habit
        </button>
      </PageHead>

      {habits.error ? (
        <ErrorCard message="We could not load your habits." onRetry={habits.retry} />
      ) : !habits.data ? (
        <LoadingCards />
      ) : habits.data.length === 0 ? (
        <EmptyRow title="No habits yet" body="Add one small thing you can do every day." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {habits.data.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3.5 rounded-[18px] bg-surface px-4 py-3.5 shadow-card"
              style={{ "--hc": h.color } as React.CSSProperties}
            >
              <span className="size-3.5 flex-none rounded-full bg-(--hc)" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-bold [overflow-wrap:anywhere]">{h.name}</div>
                <div className="text-sm text-muted tabular-nums">
                  Current {h.currentStreak} · Best {h.bestStreak} · {describeDays(daysOn(h, today))}
                </div>
                <PendingDays habit={h} today={today} />
              </div>
              <button
                className="link"
                type="button"
                aria-label={`Edit ${h.name}`}
                onClick={() => setSheet({ mode: "edit", habit: h })}
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 flex flex-col items-stretch gap-3">
        <button className="btn btn-ghost btn-block" type="button" onClick={() => logOut()}>
          Log out{email ? ` of ${email}` : ""}
        </button>
        <p className="text-center text-[13px] text-muted">Each person only ever sees their own habits.</p>
      </div>

      <HabitSheet
        uid={profile.uid}
        state={sheet}
        habitCount={habits.data?.length ?? 0}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
