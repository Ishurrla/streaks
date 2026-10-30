// Calls the local cron endpoints the way GitHub Actions does, while `pnpm dev` is running.
// Usage: pnpm cron:dev [rollover|reminders]   (both when omitted)
// The secret comes from CRON_SECRET in the environment or apps/web/.env.local.
import { readFileSync } from "node:fs";

function cronSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  try {
    const env = readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8");
    const line = env.match(/^CRON_SECRET=(.*)$/m)?.[1]?.trim();
    return line?.replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

const secret = cronSecret();
if (!secret) {
  console.error("Set CRON_SECRET in apps/web/.env.local (any long random string), restart pnpm dev, and try again.");
  process.exit(1);
}

const base = process.env.APP_URL ?? "http://localhost:3000";
const jobs = process.argv[2] ? [process.argv[2]] : ["rollover", "reminders"];
let failed = false;
for (const job of jobs) {
  try {
    const res = await fetch(`${base}/api/cron/${job}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    console.log(`${job}: ${res.status} ${await res.text()}`);
    failed ||= !res.ok;
  } catch (e) {
    console.error(`${job}: could not reach ${base} (is pnpm dev running?) ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
