import { deleteAccountFor } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Deletes the caller's whole users/{uid} tree, then the Auth user. Needs a sign-in from
 * the last 5 minutes (auth_time in the verified token), else 403 requires-recent-login.
 * The token is also checked against revocation, since this cannot be undone.
 */
export const POST = authedRoute(({ uid, token }) => deleteAccountFor(uid, token.auth_time, new Date()), {
  checkRevoked: true,
});
