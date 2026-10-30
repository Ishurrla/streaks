import { adminDb, checkInIds, clearFirestore, seedHabit, signUpUser, type TestUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as checkIn } from "@/app/api/check-in/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as undoCheckIn } from "@/app/api/undo-check-in/route";
import { post } from "./helpers";

beforeEach(async () => {
  await clearFirestore();
});

/** A signed-up user with a profile (created through the route) and one habit, h1. */
async function userWithHabit(): Promise<TestUser> {
  const user = await signUpUser();
  expect((await post(ensureProfile, {}, { token: user.idToken })).status).toBe(200);
  await seedHabit(user.uid, "h1");
  return user;
}

describe("POST /api/check-in", () => {
  it("checks in today and returns the server's date and stats", async () => {
    const user = await userWithHabit();
    const res = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ changed: true, currentStreak: 1, bestStreak: 1 });
    expect(res.json.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await checkInIds(user.uid, "h1")).toEqual([res.json.date]);
  });

  it("twice in one day leaves one document and does not error", async () => {
    const user = await userWithHabit();
    const first = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    const second = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.json.changed).toBe(true);
    expect(second.json.changed).toBe(false);
    expect(await checkInIds(user.uid, "h1")).toEqual([first.json.date]);
  });

  it("ignores any date the client sends", async () => {
    const user = await userWithHabit();
    const res = await post(checkIn, { habitId: "h1", date: "2020-01-01" }, { token: user.idToken });
    expect(res.json.date).not.toBe("2020-01-01");
    expect(await checkInIds(user.uid, "h1")).toEqual([res.json.date]);
  });

  it("400s for a missing or malformed habitId or body", async () => {
    const user = await userWithHabit();
    for (const body of [{}, { habitId: "" }, { habitId: "a/b" }, { habitId: 42 }, { habitId: "x".repeat(129) }]) {
      const res = await post(checkIn, body, { token: user.idToken });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error.code).toBe("invalid-argument");
    }
    for (const raw of ["{not json", "[]", "null", '"h1"', "42"]) {
      expect((await post(checkIn, undefined, { token: user.idToken, raw })).status, raw).toBe(400);
    }
    expect(await checkInIds(user.uid, "h1")).toEqual([]);
  });

  it("409s when the caller has no profile yet", async () => {
    const user = await signUpUser();
    const res = await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("failed-precondition");
  });
});

describe("POST /api/undo-check-in", () => {
  it("removes today's check-in for the owner", async () => {
    const user = await userWithHabit();
    await post(checkIn, { habitId: "h1" }, { token: user.idToken });
    const res = await post(undoCheckIn, { habitId: "h1" }, { token: user.idToken });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ changed: true, currentStreak: 0 });
    expect(await checkInIds(user.uid, "h1")).toEqual([]);
  });

  it("is a harmless no-op when there is nothing to undo", async () => {
    const user = await userWithHabit();
    const res = await post(undoCheckIn, { habitId: "h1" }, { token: user.idToken });
    expect(res.status).toBe(200);
    expect(res.json.changed).toBe(false);
  });

  it("400s for a malformed habitId", async () => {
    const user = await userWithHabit();
    expect((await post(undoCheckIn, { habitId: "a/b" }, { token: user.idToken })).status).toBe(400);
  });
});

describe("one user cannot touch another user's habit", () => {
  it("user B gets 404 checking in or undoing on A's habit, and A's data is unchanged", async () => {
    const a = await userWithHabit();
    await post(checkIn, { habitId: "h1" }, { token: a.idToken });
    const before = await checkInIds(a.uid, "h1");
    const b = await signUpUser();
    await post(ensureProfile, {}, { token: b.idToken });

    for (const handler of [checkIn, undoCheckIn]) {
      const res = await post(handler, { habitId: "h1" }, { token: b.idToken });
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe("not-found");
    }
    expect(await checkInIds(a.uid, "h1")).toEqual(before);
  });

  it("ignores a uid in the body: the caller is always the token's user", async () => {
    const a = await userWithHabit();
    const b = await signUpUser();
    await post(ensureProfile, {}, { token: b.idToken });

    // B names A as the uid in every way a client might try.
    for (const body of [{ habitId: "h1", uid: a.uid }, { habitId: "h1", userId: a.uid, auth: { uid: a.uid } }]) {
      expect((await post(checkIn, body, { token: b.idToken })).status).toBe(404);
    }
    expect(await checkInIds(a.uid, "h1")).toEqual([]);

    // A's own token still works, and B's habit list is untouched.
    expect((await post(checkIn, { habitId: "h1", uid: b.uid }, { token: a.idToken })).status).toBe(200);
    expect((await adminDb().collection(`users/${b.uid}/habits`).get()).size).toBe(0);
    expect((await checkInIds(a.uid, "h1")).length).toBe(1);
  });
});
