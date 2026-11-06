import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "VERCEL",
  "GCLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "NEXT_PUBLIC_FIREBASE_USE_EMULATORS",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_EMULATOR_AUTH_PORT",
  "NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  // A fresh admin module (and Firebase app registry) for every test.
  vi.resetModules();
});

afterEach(async () => {
  const { getApps, deleteApp } = await import("firebase-admin/app");
  await Promise.all(getApps().map((a) => deleteApp(a)));
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const loadAdmin = () => import("../../src/admin");

describe("Admin SDK setup", () => {
  it("refuses the emulators on any Vercel deployment", async () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS = "true";
    const { adminApp } = await loadAdmin();
    expect(() => adminApp()).toThrow(/Refusing to use the Firebase emulators on Vercel/);
  });

  it("also refuses on Vercel when the real config is simply missing", async () => {
    process.env.VERCEL = "1"; // no NEXT_PUBLIC_FIREBASE_API_KEY: would fall back to emulators
    const { adminApp } = await loadAdmin();
    expect(() => adminApp()).toThrow(/Refusing/);
  });

  it("still refuses on Vercel with the emulator port variables set", async () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS = "true";
    process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT = "9199";
    process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT = "8180";
    const { adminApp } = await loadAdmin();
    expect(() => adminApp()).toThrow(/Refusing to use the Firebase emulators on Vercel/);
    // And it did not get as far as pointing the Admin SDK at them.
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeUndefined();
  });

  it("does not switch to the emulators because of the port variables alone", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "real-key";
    process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT = "9199";
    process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT = "8180";
    const { adminApp, usingEmulators } = await loadAdmin();
    expect(usingEmulators()).toBe(false);
    // Real mode: it asks for real credentials rather than using any emulator.
    expect(() => adminApp()).toThrow(/FIREBASE_PROJECT_ID is not set/);
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
  });

  it("points the Admin SDK at the emulator ports from the same variables as the browser", async () => {
    process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT = "9199";
    process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT = "8180";
    const { adminApp } = await loadAdmin();
    adminApp();
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9199");
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8180");
  });

  it("names the missing variable when real credentials are incomplete", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "real-key";
    const { adminApp } = await loadAdmin();
    expect(() => adminApp()).toThrow(/FIREBASE_PROJECT_ID is not set/);
  });

  it("accepts a private key with escaped newlines, as env vars usually hold it", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "real-key";
    process.env.FIREBASE_PROJECT_ID = "streaks-test";
    process.env.FIREBASE_CLIENT_EMAIL = "firebase-adminsdk@streaks-test.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n"); // literal backslash-n
    expect(process.env.FIREBASE_PRIVATE_KEY).not.toContain("\n");

    const { adminApp } = await loadAdmin();
    const app = adminApp();
    expect(app.options.projectId).toBe("streaks-test");
  });

  it("uses the demo project with the emulators locally", async () => {
    process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS = "true";
    const { adminApp, DEMO_PROJECT_ID } = await loadAdmin();
    expect(adminApp().options.projectId).toBe(DEMO_PROJECT_ID);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  });

  it("takes the emulator project from GCLOUD_PROJECT only if it is a demo- project", async () => {
    const { emulatorProjectId } = await loadAdmin();
    expect(emulatorProjectId({})).toBe("demo-streaks");
    expect(emulatorProjectId({ GCLOUD_PROJECT: "demo-streaks-test" })).toBe("demo-streaks-test");
    // A real project ID in the environment is never used for the emulators.
    expect(emulatorProjectId({ GCLOUD_PROJECT: "streaks-b1dca" })).toBe("demo-streaks");
  });
});
