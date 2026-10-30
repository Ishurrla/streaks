import { adminDb, checkInIds, clearFirestore, seedHabit, seedUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as checkIn } from "@/app/api/check-in/route";
import { POST as deleteAccount } from "@/app/api/delete-account/route";
import { POST as deleteHabit } from "@/app/api/delete-habit/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as registerPushToken } from "@/app/api/register-push-token/route";
import { POST as removePushToken } from "@/app/api/remove-push-token/route";
import { POST as undoCheckIn } from "@/app/api/undo-check-in/route";
import { POST as updateTimezone } from "@/app/api/update-timezone/route";
import { post } from "./helpers";

// Every route a signed-in user calls. Each must refuse a request without a valid token.
const ROUTES = {
  "check-in": checkIn,
  "undo-check-in": undoCheckIn,
  "ensure-profile": ensureProfile,
  "delete-habit": deleteHabit,
  "update-timezone": updateTimezone,
  "register-push-token": registerPushToken,
  "remove-push-token": removePushToken,
  "delete-account": deleteAccount,
};

beforeEach(async () => {
  await clearFirestore();
});

describe.each(Object.entries(ROUTES))("%s rejects callers without a valid ID token", (_name, handler) => {
  it("401 with no Authorization header", async () => {
    const res = await post(handler, { habitId: "h1" }, { token: null });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("unauthenticated");
  });

  it("401 with a header that is not a Bearer token", async () => {
    for (const authorization of ["", "Bearer", "Basic abc", "Bearer a b", "token abc"]) {
      expect((await post(handler, { habitId: "h1" }, { authorization })).status).toBe(401);
    }
  });

  it("401 with a token that is not a valid Firebase ID token", async () => {
    for (const token of ["garbage", "a.b.c", "eyJhbGciOiJub25lIn0.e30."]) {
      const res = await post(handler, { habitId: "h1" }, { token });
      expect(res.status).toBe(401);
      expect(res.json.error.code).toBe("unauthenticated");
    }
  });

  it("checks the token before reading the body", async () => {
    expect((await post(handler, undefined, { token: null, raw: "{not json" })).status).toBe(401);
  });
});

it("unauthenticated calls change nothing, whatever uid the body names", async () => {
  await seedUser("alice");
  await seedHabit("alice", "h1");
  for (const handler of Object.values(ROUTES)) {
    for (const token of [null, "garbage"]) {
      await post(handler, { habitId: "h1", uid: "alice", timezone: "Asia/Tokyo", token: "t" }, { token });
    }
  }
  expect(await checkInIds("alice", "h1")).toEqual([]);
  expect((await adminDb().doc("users/alice/habits/h1").get()).exists).toBe(true);
  expect((await adminDb().doc("users/alice").get()).get("timezone")).toBe("Africa/Lagos");
});
