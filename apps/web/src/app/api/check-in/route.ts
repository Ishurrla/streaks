import { checkInFor, requireHabitId, rolloverUser } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Checks off today's date for one of the caller's habits. The server works out the date.
 * Any day the cron has not closed yet is rolled over first, so the stats are right.
 */
export const POST = authedRoute(async ({ uid, body }) => {
  const habitId = requireHabitId(body);
  const now = new Date();
  await rolloverUser(uid, now);
  return checkInFor(uid, habitId, now);
});
