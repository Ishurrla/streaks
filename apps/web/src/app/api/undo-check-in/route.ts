import { requireHabitId, undoCheckInFor } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/** Removes today's check-in for one of the caller's habits. Past days cannot be undone. */
export const POST = authedRoute(({ uid, body }) => undoCheckInFor(uid, requireHabitId(body), new Date()));
