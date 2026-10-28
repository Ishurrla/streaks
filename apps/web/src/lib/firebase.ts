"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Must match REGION in functions/src/index.ts.
const FUNCTIONS_REGION = "europe-west1";

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

/** The real project's web config, when set. Public values (not secrets), kept in env vars. */
export const webConfig = {
  apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Public VAPID key for FCM web push (Firebase console > Cloud Messaging > Web Push certificates). */
export const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * Push needs a real project: FCM is not emulated. When it is not configured, the app
 * registers a stand-in token so the reminder flow can still be tried on the emulators.
 */
export const realPushAvailable = !!(apiKey && webConfig.messagingSenderId && webConfig.appId && vapidKey);

/**
 * With no real Firebase config (local development) the app talks to the Emulator Suite
 * under the demo-streaks project, which cannot reach any live resources.
 */
export const usingEmulators = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" || !apiKey;

// With real config plus NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true, Auth, Firestore and Functions
// use the emulators while push still registers with the real project's FCM.
const config: FirebaseOptions = usingEmulators && !apiKey
  ? { apiKey: "demo-key", projectId: "demo-streaks", authDomain: "demo-streaks.firebaseapp.com" }
  : webConfig;

function init() {
  if (getApps().length) return getApp();
  const app = initializeApp(config);
  if (usingEmulators) {
    const host = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";
    connectAuthEmulator(getAuth(app), `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(app), host, 8080);
    connectFunctionsEmulator(getFunctions(app, FUNCTIONS_REGION), host, 5001);
  }
  return app;
}

export const app = init();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
