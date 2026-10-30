import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

/** The emulators always run under this project, which cannot reach live resources. */
export const DEMO_PROJECT_ID = "demo-streaks";

/**
 * Whether the server uses the emulators. It follows the same switch as the browser
 * (NEXT_PUBLIC_FIREBASE_USE_EMULATORS, or no real web config at all), so the two never
 * disagree; emulator host variables set by `firebase emulators:exec` also turn it on.
 */
export function usingEmulators(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.FIRESTORE_EMULATOR_HOST ||
      env.FIREBASE_AUTH_EMULATOR_HOST ||
      env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ||
      !env.NEXT_PUBLIC_FIREBASE_API_KEY,
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See apps/web/.env.example.`);
  return value;
}

function createApp(): App {
  if (usingEmulators()) {
    // With an emulator host set, the Admin SDK accepts unsigned ID tokens, so anyone
    // could act as anyone. Never allow that in a production deployment.
    if (process.env.VERCEL_ENV === "production") {
      throw new Error(
        "Refusing to use the Firebase emulators in a production deployment. Remove the emulator " +
          "variables and set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
      );
    }
    const host = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";
    process.env.FIRESTORE_EMULATOR_HOST ??= `${host}:8080`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `${host}:9099`;
    return initializeApp({ projectId: DEMO_PROJECT_ID });
  }

  const projectId = requireEnv("FIREBASE_PROJECT_ID");
  return initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
      // Env vars usually hold the key with literal "\n" sequences instead of newlines.
      privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

let app: App | undefined;

/**
 * The Admin SDK app, created on first use rather than at import time, so building the
 * Next.js app never needs credentials.
 */
export function adminApp(): App {
  app ??= getApps().find((a) => a.name === "[DEFAULT]") ?? createApp();
  return app;
}

export const db = () => getFirestore(adminApp());
export const auth = () => getAuth(adminApp());
export const messaging = () => getMessaging(adminApp());
