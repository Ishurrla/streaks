import { deleteHabitFor, requireHabitId } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Deletes one of the caller's habits with its checkIns and freezeUses. Only the caller's
 * own habits can be addressed; anything else (or a habit already gone) is { deleted: false }.
 */
export const POST = authedRoute(({ uid, body }) => deleteHabitFor(uid, requireHabitId(body)));
