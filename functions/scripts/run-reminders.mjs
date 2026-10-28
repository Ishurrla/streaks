// Runs the reminders job once against the local emulators, printing each notification
// instead of sending it (FCM is not emulated). Usage:
//   pnpm --filter functions reminders:dev                         # now
//   pnpm --filter functions reminders:dev 2026-10-28T19:30:00Z    # fake clock
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-streaks";

const at = process.argv[2] ? new Date(process.argv[2]) : new Date();
if (Number.isNaN(at.getTime())) {
  console.error(`Not a date: ${process.argv[2]}`);
  process.exit(1);
}

const { runReminders } = await import("../lib/reminders.js");
const printingSender = {
  async sendEachForMulticast(message) {
    console.log(`  -> ${message.tokens.length} device(s): "${message.notification.body}"`);
    return {
      successCount: message.tokens.length,
      failureCount: 0,
      responses: message.tokens.map(() => ({ success: true, messageId: "dev" })),
    };
  },
};
console.log(`Reminders at ${at.toISOString()}:`);
console.log(await runReminders(at, printingSender, { appUrl: "http://localhost:3000" }));
process.exit(0);
