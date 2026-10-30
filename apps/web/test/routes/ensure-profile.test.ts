import { auth } from "@streaks/core";
import { adminDb, clearFirestore, signUpUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { post } from "./helpers";

beforeEach(async () => {
  await clearFirestore();
});

const profile = async (uid: string) => (await adminDb().doc(`users/${uid}`).get()).data();

describe("POST /api/ensure-profile", () => {
  it("creates the profile with defaults and the next local midnight", async () => {
    const user = await signUpUser();
    const before = Date.now();

    const res = await post(ensureProfile, { name: "  Ada  " }, { token: user.idToken });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ created: true });

    const data = (await profile(user.uid))!;
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

  it("uses a valid timezone on creation and falls back for an unknown one", async () => {
    const a = await signUpUser();
    await post(ensureProfile, { timezone: "Asia/Tokyo" }, { token: a.idToken });
    expect((await profile(a.uid))!.timezone).toBe("Asia/Tokyo");

    const b = await signUpUser();
    await post(ensureProfile, { timezone: "Not/AZone" }, { token: b.idToken });
    expect((await profile(b.uid))!.timezone).toBe("Africa/Lagos");
  });

  it("400s for fields of the wrong type, and creates nothing", async () => {
    const user = await signUpUser();
    for (const body of [{ name: 42 }, { name: "x".repeat(201) }, { timezone: ["Asia/Tokyo"] }, { timezone: {} }]) {
      const res = await post(ensureProfile, body, { token: user.idToken });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("invalid-argument");
    }
    expect(await profile(user.uid)).toBeUndefined();
  });

  it("is safe to call repeatedly and never overwrites an existing profile", async () => {
    const user = await signUpUser();
    await post(ensureProfile, { name: "Ada" }, { token: user.idToken });

    const ref = adminDb().doc(`users/${user.uid}`);
    await ref.update({ freezesAvailable: 0, name: "Ada Lovelace" });
    const before = (await ref.get()).data();

    const results = await Promise.all([
      post(ensureProfile, { name: "Someone else", timezone: "Asia/Tokyo" }, { token: user.idToken }),
      post(ensureProfile, {}, { token: user.idToken }),
      post(ensureProfile, {}, { token: user.idToken }),
    ]);
    expect(results.map((r) => r.json)).toEqual([{ created: false }, { created: false }, { created: false }]);
    expect((await ref.get()).data()).toEqual(before);
  });

  it("only ever creates one profile under concurrent first calls", async () => {
    const user = await signUpUser();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(ensureProfile, {}, { token: user.idToken })));
    expect(results.filter((r) => r.json.created === true)).toHaveLength(1);
  });

  it("falls back to the email name when no name is given", async () => {
    const user = await signUpUser("grace.hopper@example.com");
    await post(ensureProfile, {}, { token: user.idToken });
    expect((await profile(user.uid))!.name).toBe("grace.hopper");
  });

  it("creates the profile for the token's user, never a uid from the body", async () => {
    const caller = await signUpUser();
    const res = await post(ensureProfile, { uid: "victim", name: "Mallory" }, { token: caller.idToken });
    expect(res.status).toBe(200);
    expect(await profile("victim")).toBeUndefined();
    expect((await profile(caller.uid))!.name).toBe("Mallory");
  });

  it("403s for a closed (disabled) account and does not bring the profile back", async () => {
    const user = await signUpUser();
    await auth().updateUser(user.uid, { disabled: true });
    const res = await post(ensureProfile, {}, { token: user.idToken });
    expect(res.status).toBe(403);
    expect(res.json.error).toMatchObject({ code: "permission-denied", details: { reason: "account-closed" } });
    expect(await profile(user.uid)).toBeUndefined();
  });
});
