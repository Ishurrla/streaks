// Runs the rollover job once against the local emulators (the Functions emulator
// does not fire scheduled functions). Usage:
//   pnpm --filter functions rollover:dev                         # now
//   pnpm --filter functions rollover:dev 2026-10-29T23:05:00Z    # fake clock
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-streaks";

const at = process.argv[2] ? new Date(process.argv[2]) : new Date();
if (Number.isNaN(at.getTime())) {
  console.error(`Not a date: ${process.argv[2]}`);
  process.exit(1);
}

const { runRollover } = await import("../lib/rollover.js");
console.log(`Rollover at ${at.toISOString()}:`, await runRollover(at));
process.exit(0);
