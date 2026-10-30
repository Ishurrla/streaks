"use client";

import { auth } from "./firebase";

/** A failed call to one of the app's /api routes. `code` is the server's error code, e.g. "not-found". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * POSTs to /api/<path> as the signed-in user. The server takes the caller from the ID
 * token in the Authorization header, never from the body. getIdToken refreshes the
 * token when it is close to expiring.
 */
export async function callApi<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in first.");
  const idToken = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "unavailable", "Could not reach the server. Check your connection and try again.");
  }

  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? "internal", error?.message ?? `Request failed (${res.status}).`, error?.details);
  }
  return data as T;
}
