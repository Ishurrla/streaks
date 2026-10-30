"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

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

/** Development against the emulators: the app checks they are up and explains when they are not. */
export const devWithEmulators = process.env.NODE_ENV === "development" && usingEmulators;

export const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";

// Must match the ports in firebase.json.
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080 } as const;

// On the emulators the app always uses the demo-streaks project, even when real config is
// set: the emulators run as demo-streaks (ID tokens are checked against the project ID), and a demo
// project cannot reach live resources.
const config: FirebaseOptions = usingEmulators
  ? { apiKey: "demo-key", projectId: "demo-streaks", authDomain: "demo-streaks.firebaseapp.com" }
  : webConfig;

function init() {
  if (getApps().some((a) => a.name === "[DEFAULT]")) return getApp();
  const app = initializeApp(config);
  if (usingEmulators) {
    connectAuthEmulator(getAuth(app), `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(app), emulatorHost, EMULATOR_PORTS.firestore);
  }
  return app;
}

export const app = init();
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * The app push registers with. With real config plus NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true,
 * everything else stays on the emulators while push uses the real project's FCM, through a
 * second app that only messaging uses.
 */
export const pushApp =
  usingEmulators && realPushAvailable
    ? (getApps().find((a) => a.name === "push") ?? initializeApp(webConfig, "push"))
    : app;
