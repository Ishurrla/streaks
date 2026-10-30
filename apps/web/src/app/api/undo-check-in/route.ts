import { requireHabitId, rolloverUser, undoCheckInFor } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Removes today's check-in for one of the caller's habits. Past days cannot be undone.
 * Any day the cron has not closed yet is rolled over first, as for check-in.
 */
export const POST = authedRoute(async ({ uid, body }) => {
  const habitId = requireHabitId(body);
  const now = new Date();
  await rolloverUser(uid, now);
  return undoCheckInFor(uid, habitId, now);
});
