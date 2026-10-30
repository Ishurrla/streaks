import { updateTimezoneFor } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * The only way to change the caller's timezone. Settles any overdue rollover in the old
 * timezone first, then moves nextRolloverAt and recomputes stats. 400 for an unknown zone.
 */
export const POST = authedRoute(({ uid, body }) => updateTimezoneFor(uid, body.timezone, new Date()));
