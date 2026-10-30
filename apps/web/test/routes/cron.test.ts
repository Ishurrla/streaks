import { localDate, nextLocalMidnight } from "@streaks/core";
import { adminDb, clearFirestore, seedHabit, seedUser } from "@streaks/core/testing";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Wrap Node's timingSafeEqual in a spy, so the tests can prove the secret is compared in
// constant time (a plain === would never call it).
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const { timingSafeEqual } = await import("node:crypto");
const { cronSecretMatches } = await import("@/server/cron");
const rolloverRoute = await import("@/app/api/cron/rollover/route");
const remindersRoute = await import("@/app/api/cron/reminders/route");

const SECRET = "test-cron-secret-0123456789abcdef";
const ROUTES = { rollover: rolloverRoute, reminders: remindersRoute };

async function cron(handler: (req: Request) => Promise<Response>, authorization?: string) {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
  const res = await handler(new Request("http://localhost:3000/api/cron/x", { method: "POST", headers }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

const cronDoc = async (name: string) => (await adminDb().doc(`cron/${name}`).get()).data();

/** A Lagos user whose day ended at the last local midnight and has not been rolled over. */
async function seedOverdueUser(uid: string) {
  const now = new Date();
  const lastMidnight = nextLocalMidnight(new Date(now.getTime() - 86_400_000), "Africa/Lagos");
  await seedUser(uid, { nextRolloverAt: Timestamp.fromDate(lastMidnight), lastClosedDate: "2026-01-01", freezesAvailable: 0 });
}

/** A user whose reminder is due now: reminder time 00:00, so it has always passed. */
async function seedDueReminder(uid: string) {
  const now = new Date();
  await seedUser(uid, {
    reminderEnabled: true,
    reminderTime: "00:00",
    lastReminderDate: null,
    lastClosedDate: "2026-01-01",
    nextRolloverAt: Timestamp.fromDate(nextLocalMidnight(now, "Africa/Lagos")),
    nextReminderAt: Timestamp.fromDate(new Date(now.getTime() - 60_000)),
  });
  await seedHabit(uid, "h1");
  await adminDb().doc(`users/${uid}/pushTokens/t1`).set({ token: "tok-1", userAgent: "test", createdAt: now });
}

let savedSecret: string | undefined;
beforeAll(() => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});
beforeEach(async () => {
  process.env.CRON_SECRET = SECRET;
  vi.mocked(timingSafeEqual).mockClear();
  await clearFirestore();
});

describe.each(Object.entries(ROUTES))("/api/cron/%s", (name, route) => {
  it("is POST only", () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });

  it("401 with a missing secret, and does nothing", async () => {
    await seedOverdueUser("u");
    const res = await cron(route.POST);
    expect(res.status).toBe(401);
    expect(res.json.error?.code).toBe("unauthenticated");
    expect(await cronDoc(name)).toBeUndefined();
    expect((await adminDb().doc("users/u").get()).get("lastClosedDate")).toBe("2026-01-01");
  });

  it("401 with a wrong secret, and does nothing", async () => {
    await seedOverdueUser("u");
    for (const authorization of [
      "Bearer wrong",
      `Bearer ${SECRET}x`, // longer
      `Bearer ${SECRET.slice(0, -1)}`, // shorter
      `Bearer ${SECRET.toUpperCase()}`,
      `Basic ${SECRET}`, // right value, wrong scheme
      SECRET, // no scheme
      "Bearer ",
      "",
    ]) {
      expect((await cron(route.POST, authorization)).status, authorization).toBe(401);
    }
    expect(await cronDoc(name)).toBeUndefined();
    expect((await adminDb().doc("users/u").get()).get("lastClosedDate")).toBe("2026-01-01");
  });

  it("401 for everyone when CRON_SECRET is not set on the server", async () => {
    delete process.env.CRON_SECRET;
    for (const authorization of [undefined, "Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
      expect((await cron(route.POST, authorization)).status).toBe(401);
    }
    expect(await cronDoc(name)).toBeUndefined();
  });

  it("compares the secret in constant time on every request", async () => {
    await cron(route.POST, "Bearer wrong");
    await cron(route.POST, `Bearer ${SECRET}`);
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [a, b] of vi.mocked(timingSafeEqual).mock.calls) {
      // SHA-256 digests: always 32 bytes, whatever was sent.
      expect((a as Buffer).length).toBe(32);
      expect((b as Buffer).length).toBe(32);
    }
  });

  it("runs with the right secret and records lastSuccessfulRun", async () => {
    const before = Date.now();
    const res = await cron(route.POST, `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, done: true });
    const doc = (await cronDoc(name))!;
    expect((doc.lastSuccessfulRun as Timestamp).toMillis()).toBeGreaterThanOrEqual(before - 1000);
    expect(doc.lastResult).toMatchObject({ done: true });
  });
});

describe("cronSecretMatches", () => {
  it("matches only the exact Bearer secret", () => {
    expect(cronSecretMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronSecretMatches(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronSecretMatches(`Bearer ${SECRET} extra`, SECRET)).toBe(false);
    expect(cronSecretMatches(null, SECRET)).toBe(false);
    expect(cronSecretMatches("Bearer ", "")).toBe(false);
    expect(cronSecretMatches("Bearer x", undefined)).toBe(false);
  });
});

describe("what the cron endpoints do", () => {
  it("rollover closes the day for an overdue user", async () => {
    await seedOverdueUser("u");
    const res = await cron(rolloverRoute.POST, `Bearer ${SECRET}`);
    expect(res.json).toMatchObject({ ok: true, rolledOver: 1, failed: 0, done: true });
    const user = (await adminDb().doc("users/u").get()).data()!;
    const today = localDate(new Date(), "Africa/Lagos");
    expect(user.lastClosedDate < today).toBe(true);
    expect(user.lastClosedDate > "2026-01-01").toBe(true);
    expect(user.nextRolloverAt.toMillis()).toBeGreaterThan(Date.now());

    // Running again changes nothing: the user is no longer due.
    expect((await cron(rolloverRoute.POST, `Bearer ${SECRET}`)).json).toMatchObject({ rolledOver: 0, skipped: 0 });
  });

  it("reminders sends once to a due user (logged, with the emulators) and schedules tomorrow", async () => {
    await seedDueReminder("u");
    const res = await cron(remindersRoute.POST, `Bearer ${SECRET}`);
    expect(res.json).toMatchObject({ ok: true, sent: 1, failed: 0, done: true });
    const user = (await adminDb().doc("users/u").get()).data()!;
    expect(user.lastReminderDate).toBe(localDate(new Date(), "Africa/Lagos"));
    expect(user.nextReminderAt.toMillis()).toBeGreaterThan(Date.now());

    expect((await cron(remindersRoute.POST, `Bearer ${SECRET}`)).json).toMatchObject({ sent: 0 });
  });
});
