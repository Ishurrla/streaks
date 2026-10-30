import "server-only";
import { auth, CoreError, HTTP_STATUS, log, type Body } from "@streaks/core";
import type { DecodedIdToken } from "firebase-admin/auth";

export interface RouteContext {
  /** The caller, taken only from the verified ID token. Never from the body or the URL. */
  uid: string;
  token: DecodedIdToken;
  body: Body;
}

const MAX_BODY_BYTES = 16 * 1024;

export function errorResponse(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/** Verifies the Firebase ID token in `Authorization: Bearer <token>`. */
async function verifyCaller(req: Request, checkRevoked: boolean): Promise<DecodedIdToken> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new CoreError("unauthenticated", "Sign in first: missing ID token.");
  try {
    return await auth().verifyIdToken(match[1]!, checkRevoked);
  } catch (e) {
    // A valid token for a disabled account (one being deleted) is a closed account, not a bad sign-in.
    if ((e as { code?: string }).code === "auth/user-disabled") {
      throw new CoreError("permission-denied", "This account is closed.", { reason: "account-closed" });
    }
    throw new CoreError("unauthenticated", "Your sign-in has expired or is not valid. Sign in again.");
  }
}

/** The JSON body as an object. An empty body counts as {}. */
async function readBody(req: Request): Promise<Body> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new CoreError("invalid-argument", "Request body is too large.");
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CoreError("invalid-argument", "Request body must be JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CoreError("invalid-argument", "Request body must be a JSON object.");
  }
  return parsed as Body;
}

/**
 * Wraps a POST handler for a signed-in user. The token is checked before anything else,
 * the handler's result becomes a 200 JSON response, CoreErrors become 400/401/403/404/409
 * responses with { error: { code, message } }, and anything unexpected is logged and
 * returned as a plain 500.
 */
export function authedRoute<T>(handler: (ctx: RouteContext) => Promise<T>, { checkRevoked = false } = {}) {
  return async (req: Request): Promise<Response> => {
    try {
      const token = await verifyCaller(req, checkRevoked);
      const body = await readBody(req);
      return Response.json(await handler({ uid: token.uid, token, body }));
    } catch (e) {
      if (e instanceof CoreError) return errorResponse(HTTP_STATUS[e.code], e.code, e.message, e.details);
      log.error("Unhandled error in route", { path: new URL(req.url).pathname, error: String(e) });
      return errorResponse(500, "internal", "Something went wrong on the server.");
    }
  };
}
