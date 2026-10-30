import { runRollover } from "@streaks/core";
import { cronRoute } from "@/server/cron";

// Runs on the Node.js runtime (the only one cacheComponents allows; the Admin SDK needs it).
// POST only: Next.js answers other methods with 405.

/**
 * Closes the day for every user whose local midnight has passed (freezes, broken
 * streaks, next midnight). Idempotent through nextRolloverAt, so overlapping or repeated
 * runs change nothing twice. Called every 15 minutes by .github/workflows/cron.yml.
 */
export const POST = cronRoute("rollover", ({ now, deadline }) => runRollover(now, { pageSize: 25, deadline }));
