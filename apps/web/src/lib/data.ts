"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { HabitSchedule, ScheduleFields } from "@streaks/core/schedule";
import {
  collection,
  documentId,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { callApi } from "./api";
import { db } from "./firebase";
import { useLive } from "./live";

/**
 * users/{uid}/habits/{id}. The stats, milestones and schedule (after creation) are
 * written only by the server. Which days a habit is due is always read through
 * scheduledOn from @streaks/core/schedule, the same rule the server uses.
 */
export interface Habit extends HabitSchedule {
  id: string;
  name: string;
  color: string;
  createdAt: Timestamp | null;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
  /** Missing on habits from before milestones; read it through earnedMilestones. */
  milestonesEarned?: number[];
}

export function habitsRef(uid: string) {
  return collection(db, "users", uid, "habits");
}

/** Live list of the user's habits, oldest first. */
export function useHabits(uid: string) {
  return useLive<Habit[]>(["habits", uid], (next, fail) =>
    onSnapshot(
      query(habitsRef(uid), orderBy("createdAt")),
      (snap) =>
        next(
          snap.docs.map((d) => ({
            id: d.id,
            // A just-added habit has a pending server timestamp; estimate it locally.
            ...(d.data({ serverTimestamps: "estimate" }) as Omit<Habit, "id">),
          })),
        ),
      fail,
    ),
  );
}

/** Dates (YYYY-MM-DD) per habit id. */
export type DaysByHabit = Record<string, string[]>;

/**
 * Live check-in dates between `from` and `to` (inclusive) for each habit. Check-in
 * documents are keyed by date, so this is a document-ID range per habit. Emits once
 * every listener has reported, then on every change.
 */
export function useCheckInDays(
  uid: string,
  habitIds: string[],
  from: string,
  to: string,
  subcollection: "checkIns" | "freezeUses" = "checkIns",
) {
  const ids = [...habitIds].sort();
  return useLive<DaysByHabit>(["days", subcollection, uid, ids, from, to], (next, fail) => {
    const days: DaysByHabit = {};
    if (ids.length === 0) {
      next(days);
      return () => {};
    }
    const unsubs: Unsubscribe[] = ids.map((id) =>
      onSnapshot(
        query(
          collection(db, "users", uid, "habits", id, subcollection),
          where(documentId(), ">=", from),
          where(documentId(), "<=", to),
        ),
        (snap) => {
          days[id] = snap.docs.map((d) => d.id);
          if (ids.every((i) => days[i])) next({ ...days });
        },
        fail,
      ),
    );
    return () => unsubs.forEach((u) => u());
  });
}

// Server calls. The client never sends a date: the server works it out.

export interface CheckInResult {
  date: string;
  changed: boolean;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
  /** The milestone this check-in earned for the first time, else null. The only trigger for its celebration. */
  milestoneReached: number | null;
}

export const callCheckIn = (habitId: string) => callApi<CheckInResult>("check-in", { habitId });

export const callUndoCheckIn = (habitId: string) => callApi<CheckInResult>("undo-check-in", { habitId });

export const callUpdateHabitDays = (habitId: string, days: number[]) =>
  callApi<ScheduleFields>("update-habit-days", { habitId, days });

export const callDeleteHabit = (habitId: string) => callApi<{ deleted: boolean }>("delete-habit", { habitId });

export const callUpdateTimezone = (timezone: string) =>
  callApi<{ timezone: string; today: string }>("update-timezone", { timezone });

/**
 * Puts what the server just returned into the TanStack Query cache, so the screen shows
 * it at once rather than waiting for the Firestore listeners, which then confirm it.
 */
export function useHabitCache(uid: string) {
  const queryClient = useQueryClient();

  function patchHabit(habitId: string, patch: Partial<Habit>) {
    queryClient.setQueryData<Habit[]>(["habits", uid], (list) =>
      list?.map((h) => (h.id === habitId ? { ...h, ...patch } : h)),
    );
  }

  /** Adds or removes `date` in every cached check-in range for the habit that covers it. */
  function setCheckedIn(habitId: string, date: string, done: boolean) {
    const covers = (key: QueryKey) => {
      const [kind, sub, owner, ids, from, to] = key as [string, string, string, string[], string, string];
      return kind === "days" && sub === "checkIns" && owner === uid && ids.includes(habitId) && from <= date && date <= to;
    };
    queryClient.setQueriesData<DaysByHabit>({ predicate: (q) => covers(q.queryKey) }, (days) => {
      if (!days) return days;
      const others = (days[habitId] ?? []).filter((d) => d !== date);
      return { ...days, [habitId]: done ? [...others, date] : others };
    });
  }

  return {
    afterCheckIn(habitId: string, result: CheckInResult, done: boolean) {
      const { currentStreak, bestStreak, lastCheckInDate, date } = result;
      patchHabit(habitId, { currentStreak, bestStreak, lastCheckInDate });
      setCheckedIn(habitId, date, done);
    },
    afterDaysChange(habitId: string, schedule: ScheduleFields) {
      patchHabit(habitId, schedule);
    },
  };
}
