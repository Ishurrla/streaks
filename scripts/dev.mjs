// pnpm dev: builds the functions, then runs the emulators (Auth, Firestore, Functions,
// plus the UI at http://127.0.0.1:4000) and the Next.js app together.
//
// Ctrl+C stops both. The emulators save their data to .emulator-data on the way out and
// load it again on the next start, so test users survive restarts. Press Ctrl+C a second
// time to stop at once without waiting for the save.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { spawnFirebase } from "./firebase.mjs";

const PROJECT_ID = "demo-streaks";
const DATA_DIR = ".emulator-data";
const root = fileURLToPath(new URL("..", import.meta.url));

mkdirSync(new URL(`../${DATA_DIR}`, import.meta.url), { recursive: true });

console.log("Building functions…");
const build = spawnSync("pnpm --filter functions build", { cwd: root, stdio: "inherit", shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

// Output goes through pipes, so ask for colour explicitly, unless the terminal opted out.
const env = process.env.NO_COLOR ? { ...process.env } : { ...process.env, FORCE_COLOR: "1" };
const children = new Map();
let stopping = false;
let exitCode = 0;

function run(name, color, child) {
  const prefix = `\x1b[${color}m${name.padEnd(9)}│\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => console.log(prefix + line));
  }
  children.set(name, child);
  child.on("exit", (code) => {
    children.delete(name);
    if (!stopping) {
      console.log(`\n${name} stopped (exit code ${code}). Stopping the rest.`);
      stop(code || 1);
    }
    if (children.size === 0) process.exit(exitCode);
  });
}

run(
  "emulators",
  "33",
  spawnFirebase(
    [
      "emulators:start",
      "--project", PROJECT_ID,
      "--only", "auth,firestore,functions",
      "--import", DATA_DIR,
      "--export-on-exit", DATA_DIR,
    ],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  ),
);

run(
  "web",
  "36",
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {
    cwd: new URL("../apps/web/", import.meta.url),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }),
);

function killTree(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

/** One child died on its own: save the emulator data, then stop whatever is left. */
function stop(code) {
  stopping = true;
  exitCode = code;
  const emulators = children.get("emulators");
  if (emulators) {
    spawnFirebase(["emulators:export", DATA_DIR, "--force", "--project", PROJECT_ID], { cwd: root, stdio: "ignore" })
      .on("exit", () => killTree(emulators));
  }
  const web = children.get("web");
  if (web) killTree(web);
}

// Ctrl+C reaches every process in the terminal, so the emulators and Next.js shut
// themselves down (the emulators export first). Wait for them; a second Ctrl+C forces it.
process.on("SIGINT", () => {
  if (stopping) {
    console.log("\nStopping now, without saving.");
    for (const child of children.values()) killTree(child);
    return;
  }
  stopping = true;
  console.log(`\nStopping. The emulators are saving data to ${DATA_DIR}… (Ctrl+C again to skip)`);
  setTimeout(() => {
    for (const child of children.values()) killTree(child);
  }, 60_000).unref();
});
