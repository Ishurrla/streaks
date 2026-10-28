import { getApps, initializeApp as initAdmin } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

export const PROJECT_ID = "demo-streaks";
export const REGION = "europe-west1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Run the tests through \`pnpm test\` (firebase emulators:exec).`);
  return v;
}

/** Admin SDK pointed at the Firestore emulator, for seeding and inspecting data. */
export function adminDb() {
  requireEnv("FIRESTORE_EMULATOR_HOST");
  const app = getApps()[0] ?? initAdmin({ projectId: PROJECT_ID });
  return getAdminFirestore(app);
}

export async function clearFirestore(): Promise<void> {
  const host = requireEnv("FIRESTORE_EMULATOR_HOST");
  const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`);
}

let clientCount = 0;
const clientApps: FirebaseApp[] = [];

/** A fresh client SDK app (its own auth state) wired to the Auth and Functions emulators. */
export function newClient() {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "demo-key" }, `client-${++clientCount}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${requireEnv("FIREBASE_AUTH_EMULATOR_HOST")}`, { disableWarnings: true });
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return {
    auth,
    call: <Req = unknown, Res = unknown>(name: string, data?: Req) =>
      httpsCallable<Req, Res>(functions, name)(data as Req).then((r) => r.data),
    async signUp(email = `user${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`) {
      const cred = await createUserWithEmailAndPassword(auth, email, "password123");
      return cred.user;
    },
  };
}

export async function disposeClients(): Promise<void> {
  await Promise.all(clientApps.splice(0).map((a) => deleteApp(a).catch(() => undefined)));
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
