import { catchUpUser, ensureProfileFor, optionalString } from "@streaks/core";
import { authedRoute } from "@/server/route";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).

/**
 * Creates the caller's profile on first sign-in. The name and timezone are only used on
 * creation, and an unknown timezone falls back to the default. The app calls this on every
 * start, so for an existing profile it also catches up: any day the cron has not closed
 * yet is rolled over now, and the reminder schedule is brought up to date.
 */
export const POST = authedRoute(async ({ uid, token, body }) => {
  const name = optionalString(body, "name", 200);
  const timezone = optionalString(body, "timezone", 64);
  const fallbackName = (token.name as string | undefined) ?? token.email?.split("@")[0] ?? "";
  const now = new Date();
  const result = await ensureProfileFor(uid, { name, timezone }, now, fallbackName);
  if (!result.created) await catchUpUser(uid, now);
  return result;
});
