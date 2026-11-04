// Server-only logic shared by the Next.js route handlers and the cron endpoints.
// Everything takes the caller's uid and the current time as arguments, so the
// routes decide who is calling (from a verified ID token) and tests control the clock.
export { adminApp, auth, db, DEMO_PROJECT_ID, emulatorProjectId, messaging, usingEmulators } from "./admin";
export { CoreError, HTTP_STATUS, type ErrorCode } from "./errors";
export { log } from "./log";
export { HABIT_NAME_MAX, NAME_MAX, type Theme, type UserDoc } from "./model";
export { addDays, computeStreaks, dayNumber, type StreakStats } from "./streaks";
export { DEFAULT_TIMEZONE, isValidTimezone, localDate, nextLocalMidnight } from "./time";
export { optionalString, requireHabitId, type Body } from "./validation";
export { checkInFor, streaksFor, undoCheckInFor, type CheckInResult } from "./checkins";
export * from "./schedule";
export { ensureProfileFor, nameFromClaims, type EnsureProfileInput } from "./profile";
export { deleteHabitFor, requireDays, updateHabitDaysFor } from "./habits";
export { updateTimezoneFor } from "./timezone";
export { rolloverUser, runRollover, type RolloverOptions, type RolloverResult } from "./rollover";
export {
  loggingSender,
  nextReminderAt,
  reminderText,
  remindUser,
  runReminders,
  syncReminderSchedule,
  type ReminderOptions,
  type ReminderSettings,
  type RemindersResult,
  type Sender,
} from "./reminders";
export { catchUpUser } from "./catchup";
export { registerPushTokenFor, removePushTokenFor, requireToken, tokenId } from "./push";
export { deleteAccountFor, RECENT_LOGIN_SECONDS } from "./account";
