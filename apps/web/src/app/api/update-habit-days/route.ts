import { requireDays, requireHabitId, updateHabitDaysFor } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * The only way to change which days one of the caller's habits is due after it is
 * created. 400 unless days is 1 to 7 different whole numbers from 0 (Monday) to 6.
 * The change starts tomorrow in the user's timezone; the response is the new schedule.
 */
export const POST = authedRoute(({ uid, body }) =>
  updateHabitDaysFor(uid, requireHabitId(body), requireDays(body.days), new Date()),
);
