// Emulator only: gives an existing user some habit history so streaks, the "at risk"
// state and the Progress calendar have something to show. Usage, with emulators up:
//   pnpm --filter functions seed:dev ada@example.com
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GCLOUD_PROJECT ??= "demo-streaks";

const email = process.argv[2];
if (!email) {
  console.error("Usage: seed-dev.mjs <email>");
  process.exit(1);
}

const { auth, db } = await import("../lib/admin.js");
const { addDays, computeStreaks } = await import("../lib/streaks.js");
const { localDate } = await import("../lib/time.js");
const { FieldValue } = await import("firebase-admin/firestore");

const user = await auth.getUserByEmail(email);
const userRef = db.collection("users").doc(user.uid);
const profile = await userRef.get();
if (!profile.exists) {
  console.error(`${email} has no profile yet. Sign in once first.`);
  process.exit(1);
}
const today = localDate(new Date(), profile.get("timezone"));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => addDays(today, -(from + i)));

// Days ago that each habit was done. Mirrors the prototype's sample data.
const HABITS = [
  { name: "Read for 20 minutes", color: "#3B6FD8", ago: [...range(1, 12), ...range(20, 40)] },
  { name: "Go for a walk", color: "#13795B", ago: [...range(1, 5), ...range(7, 8), ...range(11, 13)] },
  { name: "Drink 2 litres of water", color: "#D17F00", ago: [...range(3, 9), ...range(14, 16)] },
  { name: "Stretch before bed", color: "#C2569A", ago: [...range(1, 3), ...range(6, 7)] },
];

for (const h of HABITS) {
  const ref = userRef.collection("habits").doc();
  const stats = computeStreaks(h.ago, [], today);
  await ref.set({
    name: h.name,
    color: h.color,
    createdAt: new Date(Date.now() - 45 * 86_400_000),
    ...stats,
  });
  const batch = db.batch();
  for (const d of h.ago) batch.set(ref.collection("checkIns").doc(d), { createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  console.log(`${h.name}: current ${stats.currentStreak}, best ${stats.bestStreak}`);
}
process.exit(0);
