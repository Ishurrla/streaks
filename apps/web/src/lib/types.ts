import type { Timestamp } from "firebase/firestore";

export type Theme = "light" | "dark" | "system";

/** users/{uid}. Mirrors packages/core/src/model.ts. */
export interface Profile {
  name: string;
  timezone: string;
  reminderEnabled: boolean;
  reminderTime: string;
  theme: Theme;
  freezesAvailable: number;
  nextRolloverAt: Timestamp;
  lastReminderDate: string | null;
  /** Server-owned: when the reminders job next looks at this user. */
  nextReminderAt?: Timestamp | null;
  lastClosedDate?: string;
}

/** The five habit colours. firestore.rules accepts only these. */
export const HABIT_COLORS = ["#13795B", "#3B6FD8", "#C2569A", "#D17F00", "#7A5BD6"] as const;
