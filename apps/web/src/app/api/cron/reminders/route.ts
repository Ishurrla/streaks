import { loggingSender, messaging, runReminders, usingEmulators } from "@streaks/core";
import { cronRoute } from "@/server/cron";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).
// POST only: Next.js answers other methods with 405.

/**
 * Sends today's push reminder to every user whose nextReminderAt has passed. At most once
 * a day per user (lastReminderDate). FCM is not emulated, so with the emulators the
 * message is logged instead of sent. Called every 15 minutes by cron-job.org, with .github/workflows/cron.yml as a backup.
 */
export const POST = cronRoute("reminders", ({ now, deadline, origin }) =>
  runReminders(now, usingEmulators() ? loggingSender : messaging(), {
    pageSize: 25,
    deadline,
    appUrl: process.env.APP_URL || origin,
  }),
);
