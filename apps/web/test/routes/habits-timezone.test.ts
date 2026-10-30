import { adminDb, checkInIds, clearFirestore, seedHabit, signUpUser, type TestUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as deleteHabit } from "@/app/api/delete-habit/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as updateTimezone } from "@/app/api/update-timezone/route";
import { post } from "./helpers";

beforeEach(async () => {
  await clearFirestore();
});

async function userWithProfile(): Promise<TestUser> {
  const user = await signUpUser();
  expect((await post(ensureProfile, {}, { token: user.idToken })).status).toBe(200);
  return user;
}

const exists = async (path: string) => (await adminDb().doc(path).get()).exists;

describe("POST /api/delete-habit", () => {
  it("deletes the owner's habit with its checkIns and freezeUses", async () => {
    const user = await userWithProfile();
    await seedHabit(user.uid, "h1", ["2026-10-26", "2026-10-27"], ["2026-10-25"]);
    await seedHabit(user.uid, "keep", ["2026-10-27"]);

    const res = await post(deleteHabit, { habitId: "h1" }, { token: user.idToken });
    expect(res).toEqual({ status: 200, json: { deleted: true } });
    expect(await exists(`users/${user.uid}/habits/h1`)).toBe(false);
    expect(await checkInIds(user.uid, "h1")).toEqual([]);
    expect((await adminDb().collection(`users/${user.uid}/habits/h1/freezeUses`).get()).size).toBe(0);
    expect(await checkInIds(user.uid, "keep")).toEqual(["2026-10-27"]);
  });

  it("is a harmless no-op for a habit that is already gone", async () => {
    const user = await userWithProfile();
    expect((await post(deleteHabit, { habitId: "missing" }, { token: user.idToken })).json).toEqual({ deleted: false });
  });

  it("400s for a missing or malformed habitId", async () => {
    const user = await userWithProfile();
    for (const body of [{}, { habitId: "" }, { habitId: "a/b" }, { habitId: 7 }]) {
      expect((await post(deleteHabit, body, { token: user.idToken })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("user B cannot delete user A's habit, even naming A's uid in the body", async () => {
    const a = await userWithProfile();
    await seedHabit(a.uid, "h1", ["2026-10-27"]);
    const b = await userWithProfile();

    for (const body of [{ habitId: "h1" }, { habitId: "h1", uid: a.uid }]) {
      const res = await post(deleteHabit, body, { token: b.idToken });
      expect(res.json).toEqual({ deleted: false });
    }
    expect(await exists(`users/${a.uid}/habits/h1`)).toBe(true);
    expect(await checkInIds(a.uid, "h1")).toEqual(["2026-10-27"]);
  });
});

describe("POST /api/update-timezone", () => {
  it("changes the caller's timezone and moves nextRolloverAt", async () => {
    const user = await userWithProfile();
    const res = await post(updateTimezone, { timezone: "Asia/Tokyo" }, { token: user.idToken });
    expect(res.status).toBe(200);
    expect(res.json.timezone).toBe("Asia/Tokyo");
    expect(res.json.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const profile = (await adminDb().doc(`users/${user.uid}`).get()).data()!;
    expect(profile.timezone).toBe("Asia/Tokyo");
    // Tokyo is UTC+9 with no DST, so its midnight is 15:00 UTC.
    expect((profile.nextRolloverAt.toDate() as Date).getUTCHours()).toBe(15);
    expect(profile.nextRolloverAt.toDate().toISOString()).toBe(res.json.nextRolloverAt);
  });

  it("400s for an unknown or missing timezone and leaves the profile alone", async () => {
    const user = await userWithProfile();
    const before = (await adminDb().doc(`users/${user.uid}`).get()).data();
    for (const body of [{}, { timezone: "Mars/Olympus" }, { timezone: 9 }, { timezone: "" }]) {
      const res = await post(updateTimezone, body, { token: user.idToken });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("invalid-argument");
    }
    expect((await adminDb().doc(`users/${user.uid}`).get()).data()).toEqual(before);
  });

  it("409s when the caller has no profile yet", async () => {
    const user = await signUpUser();
    expect((await post(updateTimezone, { timezone: "Asia/Tokyo" }, { token: user.idToken })).status).toBe(409);
  });

  it("only ever changes the token's user, never a uid from the body", async () => {
    const a = await userWithProfile();
    const b = await userWithProfile();
    await post(updateTimezone, { timezone: "Asia/Tokyo", uid: a.uid }, { token: b.idToken });
    expect((await adminDb().doc(`users/${a.uid}`).get()).get("timezone")).toBe("Africa/Lagos");
    expect((await adminDb().doc(`users/${b.uid}`).get()).get("timezone")).toBe("Asia/Tokyo");
  });
});
