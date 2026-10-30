import { checkInIds, clearFirestore, seedHabit, seedUser } from "@streaks/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as checkIn } from "@/app/api/check-in/route";
import { POST as ensureProfile } from "@/app/api/ensure-profile/route";
import { POST as undoCheckIn } from "@/app/api/undo-check-in/route";
import { post } from "./helpers";

const ROUTES = { "check-in": checkIn, "undo-check-in": undoCheckIn, "ensure-profile": ensureProfile };

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

it("an unauthenticated check-in changes nothing", async () => {
  await seedUser("alice");
  await seedHabit("alice", "h1");
  await post(checkIn, { habitId: "h1", uid: "alice" }, { token: null });
  await post(checkIn, { habitId: "h1", uid: "alice" }, { token: "garbage" });
  expect(await checkInIds("alice", "h1")).toEqual([]);
});
