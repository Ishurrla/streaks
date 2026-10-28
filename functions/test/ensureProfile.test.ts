import { FunctionsError } from "firebase/functions";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminDb, clearFirestore, disposeClients, newClient } from "./helpers";

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await disposeClients();
});

describe("ensureProfile (callable)", () => {
  it("rejects callers who are not signed in", async () => {
    const client = newClient();
    await expect(client.call("ensureProfile")).rejects.toSatisfy(
      (e: unknown) => e instanceof FunctionsError && e.code === "functions/unauthenticated",
    );
  });

  it("creates the profile with defaults and the next local midnight", async () => {
    const client = newClient();
    const user = await client.signUp();
    const before = Date.now();

    const res = await client.call("ensureProfile", { name: "  Ada  " });
    expect(res).toEqual({ created: true });

    const data = (await adminDb().doc(`users/${user.uid}`).get()).data()!;
    expect(data).toMatchObject({
      name: "Ada",
      timezone: "Africa/Lagos",
      reminderEnabled: false,
      reminderTime: "20:00",
      theme: "system",
      freezesAvailable: 1,
      lastReminderDate: null,
    });
    expect(data.lastClosedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const rollover = data.nextRolloverAt.toDate() as Date;
    expect(rollover.getTime()).toBeGreaterThan(before);
    expect(rollover.getTime() - before).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    // Lagos is UTC+1 all year, so its midnight is always 23:00 UTC.
    expect(rollover.getUTCHours()).toBe(23);
    expect(rollover.getUTCMinutes()).toBe(0);
  });

  it("uses a valid timezone from the client on creation and ignores an invalid one", async () => {
    const a = newClient();
    const ua = await a.signUp();
    await a.call("ensureProfile", { timezone: "Asia/Tokyo" });
    expect((await adminDb().doc(`users/${ua.uid}`).get()).get("timezone")).toBe("Asia/Tokyo");

    const b = newClient();
    const ub = await b.signUp();
    await b.call("ensureProfile", { timezone: "Not/AZone" });
    expect((await adminDb().doc(`users/${ub.uid}`).get()).get("timezone")).toBe("Africa/Lagos");
  });

  it("is safe to call repeatedly and never overwrites an existing profile", async () => {
    const client = newClient();
    const user = await client.signUp();
    await client.call("ensureProfile", { name: "Ada" });

    const ref = adminDb().doc(`users/${user.uid}`);
    await ref.update({ freezesAvailable: 0, name: "Ada Lovelace" });
    const before = (await ref.get()).data();

    const results = await Promise.all([
      client.call("ensureProfile", { name: "Someone else", timezone: "Asia/Tokyo" }),
      client.call("ensureProfile"),
      client.call("ensureProfile"),
    ]);
    expect(results).toEqual([{ created: false }, { created: false }, { created: false }]);
    expect((await ref.get()).data()).toEqual(before);
  });

  it("only ever creates one profile under concurrent first calls", async () => {
    const client = newClient();
    await client.signUp();
    const results = await Promise.all(Array.from({ length: 5 }, () => client.call("ensureProfile")));
    expect(results.filter((r) => (r as { created: boolean }).created)).toHaveLength(1);
  });

  it("falls back to the email name when no name is given", async () => {
    const client = newClient();
    const user = await client.signUp("grace.hopper@example.com");
    await client.call("ensureProfile");
    expect((await adminDb().doc(`users/${user.uid}`).get()).get("name")).toBe("grace.hopper");
  });
});
