// Runs the project's Firebase CLI (the pinned firebase-tools dev dependency) directly with
// Node. Usage: node scripts/firebase.mjs <firebase args>
//
// Starting the CLI's JS entry point, rather than the firebase.cmd shim, means Ctrl+C on
// Windows reaches it without a "Terminate batch job?" prompt, so --export-on-exit can
// finish saving emulator data.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const firebaseBin = fileURLToPath(new URL("../node_modules/firebase-tools/lib/bin/firebase.js", import.meta.url));

export function spawnFirebase(args, options = {}) {
  return spawn(process.execPath, [firebaseBin, ...args], { ...options, env: { ...process.env, ...options.env } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = spawnFirebase(process.argv.slice(2), { stdio: "inherit" });
  // Ctrl+C reaches the CLI directly. Wait for it to finish shutting down (and exporting).
  process.on("SIGINT", () => {});
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
