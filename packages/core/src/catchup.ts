import { syncReminderSchedule } from "./reminders";
import { rolloverUser } from "./rollover";

/**
 * Lazy catch-up for a user who has just shown up. The cron can run late or be missed (a
 * scheduler outage, or GitHub delaying the backup workflow), so this closes any day that ended without being rolled over,
 * then makes sure nextReminderAt matches the current settings. Both steps are no-ops
 * when nothing is due, so it is safe on every app start.
 */
export async function catchUpUser(uid: string, now: Date): Promise<{ rolledOver: boolean }> {
  const rolledOver = await rolloverUser(uid, now);
  await syncReminderSchedule(uid, now);
  return { rolledOver };
}
