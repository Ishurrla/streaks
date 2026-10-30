import { ensureProfileFor, optionalString } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Creates the caller's profile on first sign-in; a no-op after that. The name and
 * timezone are only used on creation, and an unknown timezone falls back to the default.
 */
export const POST = authedRoute(({ uid, token, body }) => {
  const name = optionalString(body, "name", 200);
  const timezone = optionalString(body, "timezone", 64);
  const fallbackName = (token.name as string | undefined) ?? token.email?.split("@")[0] ?? "";
  return ensureProfileFor(uid, { name, timezone }, new Date(), fallbackName);
});
