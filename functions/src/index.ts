import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { checkInFor, undoCheckInFor } from "./checkins";
import { deleteHabitFor } from "./habits";
import { ensureProfileFor, type EnsureProfileInput } from "./profile";

export const REGION = "europe-west1";
setGlobalOptions({ region: REGION, maxInstances: 10 });

function requireUid(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}

function asObject(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function requireHabitId(data: unknown): string {
  const { habitId } = asObject(data);
  if (typeof habitId !== "string" || habitId.length === 0 || habitId.length > 128 || habitId.includes("/")) {
    throw new HttpsError("invalid-argument", "habitId must be a document ID.");
  }
  return habitId;
}

export const ensureProfile = onCall(async (req) => {
  const uid = requireUid(req);
  const fallbackName = (req.auth?.token.name as string | undefined) ?? req.auth?.token.email?.split("@")[0] ?? "";
  return ensureProfileFor(uid, asObject(req.data) as EnsureProfileInput, new Date(), fallbackName);
});

// The client sends only the habit ID. The date always comes from the server clock
// and the user's saved timezone.
export const checkIn = onCall(async (req) => {
  const uid = requireUid(req);
  return checkInFor(uid, requireHabitId(req.data), new Date());
});

export const undoCheckIn = onCall(async (req) => {
  const uid = requireUid(req);
  return undoCheckInFor(uid, requireHabitId(req.data), new Date());
});

export const deleteHabit = onCall(async (req) => {
  const uid = requireUid(req);
  return deleteHabitFor(uid, requireHabitId(req.data));
});
