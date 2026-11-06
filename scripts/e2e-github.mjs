// GitHub sign-in in a real browser, with the Auth emulator's own GitHub window, on the TEST
// emulators (firebase.test.json: Auth 9199, Firestore 8180, project demo-streaks-test). Never
// touches `pnpm dev`'s emulators or data, and can run while it is up.
// Usage: pnpm test:github
//
// It builds the app pointed at the test emulators, serves it on port 3201, and runs
// apps/web/e2e/github.spec.ts against it. The build replaces apps/web/.next's production
// build (not the dev server's), so run `pnpm build` again before `next start` on your own.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnFirebase } from "./firebase.mjs";

const PORT = 3201;
const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const nextBin = fileURLToPath(new URL("../apps/web/node_modules/next/dist/bin/next", import.meta.url));

if (!process.argv.includes("--inner")) {
  // Starts the test emulators, runs the rest of this script inside, and stops them after.
  const child = spawnFirebase(
    ["emulators:exec", "--config", "firebase.test.json", "--project", "demo-streaks-test", "--only", "auth,firestore", `node "${fileURLToPath(import.meta.url)}" --inner`],
    { stdio: "inherit", cwd: fileURLToPath(new URL("..", import.meta.url)) },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  // Inside emulators:exec, FIREBASE_AUTH_EMULATOR_HOST and GCLOUD_PROJECT name the test ones.
  const [, authPort] = (process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "").split(":");
  const [, firestorePort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "").split(":");
  const env = {
    ...process.env,
    // Emulator mode even if apps/web/.env.local has real config (these win over that file).
    NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
    NEXT_PUBLIC_EMULATOR_AUTH_PORT: authPort,
    NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: firestorePort,
    NEXT_PUBLIC_EMULATOR_PROJECT_ID: process.env.GCLOUD_PROJECT,
  };
  const run = (cmd, args, extra = {}) =>
    new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { cwd: web, env: { ...env, ...extra }, stdio: "inherit", shell: process.platform === "win32" });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
    });

  let server;
  try {
    await run("pnpm", ["build"]);
    server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], { cwd: web, env, stdio: "inherit" });
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
      } catch {}
      if (i > 60) throw new Error("The app did not start");
      await new Promise((r) => setTimeout(r, 1000));
    }
    await run("pnpm", ["exec", "playwright", "test", "e2e/github.spec.ts"], { LAYOUT_BASE_URL: `http://localhost:${PORT}` });
    process.exitCode = 0;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    server?.kill();
  }
}
