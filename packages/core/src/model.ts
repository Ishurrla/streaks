import type { Timestamp } from "firebase-admin/firestore";

export type Theme = "light" | "dark" | "system";

export interface UserDoc {
  name: string;
  timezone: string;
  reminderEnabled: boolean;
  reminderTime: string; // "HH:mm", local to `timezone`
  theme: Theme;
  freezesAvailable: number;
  nextRolloverAt: Timestamp;
  lastReminderDate: string | null;
  /** When the reminders job should next look at this user; null with reminders off. Server-owned. */
  nextReminderAt: Timestamp | null;
  /** Last local date settled by the rollover job. checkIn/undoCheckIn refuse it and anything earlier. */
  lastClosedDate: string;
  createdAt: Timestamp;
}

export const NAME_MAX = 50;
export const HABIT_NAME_MAX = 40;
