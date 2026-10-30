// Test helpers for code that runs against the Auth and Firestore emulators. Imported
// only by tests (as "@streaks/core/testing"), never by the app.
import { Timestamp } from "firebase-admin/firestore";
import { DEMO_PROJECT_ID, db } from "./admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Run the tests through \`pnpm test\` (firebase emulators:exec).`);
  }
  return v;
}

/** Admin Firestore on the emulator. Refuses to run without it, so tests never touch a real project. */
export function adminDb() {
  requireEnv("FIRESTORE_EMULATOR_HOST");
  requireEnv("FIREBASE_AUTH_EMULATOR_HOST");
  return db();
}

export async function clearFirestore(): Promise<void> {
  const host = requireEnv("FIRESTORE_EMULATOR_HOST");
  const res = await fetch(`http://${host}/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`);
}

export interface TestUser {
  uid: string;
  email: string;
  idToken: string;
}

/** Creates an Auth emulator user and returns a real ID token for it. */
export async function signUpUser(
  email = `user${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
): Promise<TestUser> {
  const host = requireEnv("FIREBASE_AUTH_EMULATOR_HOST");
  const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Auth emulator sign-up failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { localId: string; idToken: string };
  return { uid: data.localId, email, idToken: data.idToken };
}

export async function seedUser(uid: string, fields: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      name: "Test",
      timezone: "Africa/Lagos",
      reminderEnabled: false,
      reminderTime: "20:00",
      theme: "system",
      freezesAvailable: 1,
      nextRolloverAt: Timestamp.now(),
      lastReminderDate: null,
      lastClosedDate: "2026-01-01",
      ...fields,
    });
}

export async function seedHabit(uid: string, habitId: string, checkIns: string[] = [], freezes: string[] = []) {
  const ref = adminDb().doc(`users/${uid}/habits/${habitId}`);
  await ref.set({
    name: "Read",
    color: "#13795B",
    createdAt: Timestamp.now(),
    currentStreak: 0,
    bestStreak: 0,
    lastCheckInDate: null,
  });
  await Promise.all([
    ...checkIns.map((d) => ref.collection("checkIns").doc(d).set({ createdAt: Timestamp.now() })),
    ...freezes.map((d) => ref.collection("freezeUses").doc(d).set({ createdAt: Timestamp.now() })),
  ]);
  return ref;
}

export async function checkInIds(uid: string, habitId: string) {
  const snap = await adminDb().collection(`users/${uid}/habits/${habitId}/checkIns`).get();
  return snap.docs.map((d) => d.id).sort();
}
