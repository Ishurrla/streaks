import { registerPushTokenFor, requireToken } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/** Saves this device's FCM token for the caller, moving it away from any other account. */
export const POST = authedRoute(({ uid, body, req }) =>
  registerPushTokenFor(uid, requireToken(body), req.headers.get("user-agent") ?? undefined),
);
