import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

/** The emulators always run under this project, which cannot reach live resources. */
export const DEMO_PROJECT_ID = "demo-streaks";

/**
 * The project the emulators run as. `pnpm dev` uses demo-streaks; the test emulators run as
 * demo-streaks-test (set in GCLOUD_PROJECT by `firebase emulators:exec`), so the two suites
 * never share the CLI's per-project locator file. Only demo- projects are accepted here.
 */
export function emulatorProjectId(env: NodeJS.ProcessEnv = process.env): string {
  return env.GCLOUD_PROJECT?.startsWith("demo-") ? env.GCLOUD_PROJECT : DEMO_PROJECT_ID;
}

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
    // could act as anyone. Never allow that on Vercel (production or preview).
    if (process.env.VERCEL) {
      throw new Error(
        "Refusing to use the Firebase emulators on Vercel. Set the NEXT_PUBLIC_FIREBASE_* config, " +
          "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY for this environment, " +
          "and do not set NEXT_PUBLIC_FIREBASE_USE_EMULATORS or any *_EMULATOR_HOST.",
      );
    }
    // Where the emulators are; the same variables as the browser. Only read past the check above.
    const host = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? "127.0.0.1";
    process.env.FIRESTORE_EMULATOR_HOST ??= `${host}:${process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT || 8080}`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `${host}:${process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT || 9099}`;
    return initializeApp({ projectId: emulatorProjectId() });
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
