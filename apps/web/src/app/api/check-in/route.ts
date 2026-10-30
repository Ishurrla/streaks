import { checkInFor, requireHabitId } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/** Checks off today's date for one of the caller's habits. The server works out the date. */
export const POST = authedRoute(({ uid, body }) => checkInFor(uid, requireHabitId(body), new Date()));
