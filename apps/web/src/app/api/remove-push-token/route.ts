import { removePushTokenFor, requireToken } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/** Removes one of the caller's device tokens. Another account's token is never addressed. */
export const POST = authedRoute(({ uid, body }) => removePushTokenFor(uid, requireToken(body)));
