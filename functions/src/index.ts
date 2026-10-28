import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
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

export const ensureProfile = onCall(async (req) => {
  const uid = requireUid(req);
  const fallbackName = (req.auth?.token.name as string | undefined) ?? req.auth?.token.email?.split("@")[0] ?? "";
  return ensureProfileFor(uid, asObject(req.data) as EnsureProfileInput, new Date(), fallbackName);
});
