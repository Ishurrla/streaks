// Runs the project's Firebase CLI (the firebase-tools dev dependency) with a longer
// functions discovery timeout. Usage: node scripts/firebase.mjs <firebase args>
//
// The Functions emulator gives the functions code 10 seconds to report which functions
// it has. On a slow start (seen on Windows, while npm or antivirus is busy) it gives up,
// keeps running with no functions at all, and every callable answers 404. Sign-up then
// creates the Auth user but ensureProfile fails. 60 seconds leaves plenty of room.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const firebaseBin = fileURLToPath(new URL("../node_modules/firebase-tools/lib/bin/firebase.js", import.meta.url));

export function spawnFirebase(args, options = {}) {
  return spawn(process.execPath, [firebaseBin, ...args], {
    ...options,
    env: {
      ...process.env,
      FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT ?? "60",
      ...options.env,
    },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = spawnFirebase(process.argv.slice(2), { stdio: "inherit" });
  // Ctrl+C reaches the CLI directly. Wait for it to finish shutting down (and exporting).
  process.on("SIGINT", () => {});
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
