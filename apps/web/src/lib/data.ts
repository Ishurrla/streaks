"use client";

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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { useLive } from "./live";

/** users/{uid}/habits/{id}. The stats are written only by the server. */
export interface Habit {
  id: string;
  name: string;
  color: string;
  createdAt: Timestamp | null;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
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

// Callables. The client never sends a date: the server works it out.

export interface CheckInResult {
  date: string;
  changed: boolean;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string | null;
}

export const callCheckIn = (habitId: string) =>
  httpsCallable<{ habitId: string }, CheckInResult>(functions, "checkIn")({ habitId }).then((r) => r.data);

export const callUndoCheckIn = (habitId: string) =>
  httpsCallable<{ habitId: string }, CheckInResult>(functions, "undoCheckIn")({ habitId }).then((r) => r.data);

export const callDeleteHabit = (habitId: string) =>
  httpsCallable<{ habitId: string }, { deleted: boolean }>(functions, "deleteHabit")({ habitId }).then((r) => r.data);

export const callUpdateTimezone = (timezone: string) =>
  httpsCallable<{ timezone: string }, { timezone: string; today: string }>(functions, "updateTimezone")({
    timezone,
  }).then((r) => r.data);
