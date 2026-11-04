// Emulator only: gives an existing user some habit history so streaks, the "at risk"
// state and the Progress calendar have something to show. Usage, with `pnpm dev` up:
//   pnpm seed:dev ada@example.com
import { FieldValue } from "firebase-admin/firestore";
import { addDays, auth, db, earnedMilestones, localDate, scheduledOn, streaksFor, usingEmulators } from "../src/index";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
if (!usingEmulators()) throw new Error("seed-dev only runs against the emulators.");

const email = process.argv[2];
if (!email) {
  console.error("Usage: pnpm seed:dev <email>");
  process.exit(1);
}

const user = await auth().getUserByEmail(email);
const userRef = db().collection("users").doc(user.uid);
const profile = await userRef.get();
if (!profile.exists) {
  console.error(`${email} has no profile yet. Sign in once first.`);
  process.exit(1);
}
const today = localDate(new Date(), profile.get("timezone") as string);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(today, -(from + i)));

// Days ago that each habit was done. Mirrors the prototype's sample data. Habits with
// `days` (0 = Monday) are only done on their scheduled days, like the schedules prototype.
const HABITS: { name: string; color: string; ago: string[]; days?: number[] }[] = [
  { name: "Read for 20 minutes", color: "#3B6FD8", ago: [...range(1, 12), ...range(20, 40)] },
  { name: "Go for a walk", color: "#13795B", ago: [...range(1, 5), ...range(7, 8), ...range(11, 13)] },
  { name: "Drink 2 litres of water", color: "#D17F00", ago: [...range(3, 9), ...range(14, 16)] },
  { name: "Stretch before bed", color: "#C2569A", ago: [...range(1, 3), ...range(6, 7)] },
  { name: "Gym", color: "#3B6FD8", days: [0, 2, 4], ago: range(1, 30) },
  { name: "Meal prep", color: "#C2569A", days: [6], ago: range(1, 30) },
  { name: "Write in journal", color: "#7A5BD6", days: [0, 1, 2, 3, 4], ago: range(1, 40) },
];

for (const h of HABITS) {
  const ref = userRef.collection("habits").doc();
  const schedule = { days: h.days ?? [0, 1, 2, 3, 4, 5, 6] };
  const done = h.ago.filter((d) => scheduledOn(schedule, d));
  const stats = streaksFor(schedule, done, [], today);
  await ref.set({
    name: h.name,
    color: h.color,
    createdAt: new Date(Date.now() - 45 * 86_400_000),
    ...schedule,
    ...stats,
    milestonesEarned: earnedMilestones({ bestStreak: stats.bestStreak }),
  });
  const batch = db().batch();
  for (const d of done) batch.set(ref.collection("checkIns").doc(d), { createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  console.log(`${h.name}: current ${stats.currentStreak}, best ${stats.bestStreak}`);
}
process.exit(0);
