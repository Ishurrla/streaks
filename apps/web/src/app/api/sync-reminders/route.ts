import { syncReminderSchedule } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Recomputes the caller's server-owned nextReminderAt from their reminder settings. The
 * client writes reminderEnabled and reminderTime directly (the rules allow it), then calls
 * this so the reminders job looks at them at the right time.
 */
export const POST = authedRoute(({ uid }) => syncReminderSchedule(uid, new Date()));
