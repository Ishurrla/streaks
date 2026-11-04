import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, log } from "@streaks/core";
import { FieldValue } from "firebase-admin/firestore";
import { errorResponse } from "./route";

/**
 * Each cron run stops starting new pages after this long, leaving room inside a 10 second
 * function limit. Users not reached are still due, so the next run picks them up.
 */
export const CRON_TIME_BUDGET_MS = 7_000;

/**
 * Constant-time check of `Authorization: Bearer <secret>` against CRON_SECRET. Both sides
 * are hashed first, so timingSafeEqual always compares 32 bytes and the time taken reveals
 * neither the secret's content nor its length. With no CRON_SECRET set, nothing matches.
 */
export function cronSecretMatches(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  const given = createHash("sha256").update(match?.[1] ?? "").digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected) && match !== null;
}

export interface CronContext {
  now: Date;
  /** Wall-clock deadline (ms) for starting new pages. */
  deadline: number;
  /** Origin the cron called, used as the app URL in notification links. */
  origin: string;
}

/**
 * A POST-only cron endpoint. Without the right secret it returns 401 and does nothing.
 * After a run that completes, it records cron/{name}.lastSuccessfulRun, which the README
 * explains how to watch. Callers: cron-job.org, with .github/workflows/cron.yml as a backup.
 */
export function cronRoute<T extends { done: boolean }>(name: string, run: (ctx: CronContext) => Promise<T>) {
  return async (req: Request): Promise<Response> => {
    if (!process.env.CRON_SECRET) log.error("CRON_SECRET is not set; refusing cron request", { name });
    if (!cronSecretMatches(req.headers.get("authorization"))) {
      return errorResponse(401, "unauthenticated", "Missing or wrong cron secret.");
    }

    const started = Date.now();
    try {
      const result = await run({
        now: new Date(),
        deadline: started + CRON_TIME_BUDGET_MS,
        origin: new URL(req.url).origin,
      });
      await db()
        .collection("cron")
        .doc(name)
        .set({ lastSuccessfulRun: FieldValue.serverTimestamp(), lastResult: result, lastDurationMs: Date.now() - started });
      log.info(`Cron ${name} finished`, { ...result, ms: Date.now() - started });
      return Response.json({ ok: true, ...result });
    } catch (e) {
      log.error(`Cron ${name} failed`, { error: String(e) });
      return errorResponse(500, "internal", `Cron ${name} failed.`);
    }
  };
}
