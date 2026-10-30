/**
 * Errors the core throws on purpose. Route handlers turn them into HTTP responses:
 * invalid-argument 400, unauthenticated 401, permission-denied 403, not-found 404,
 * failed-precondition 409. Anything else is an unexpected 500.
 */
export type ErrorCode = "invalid-argument" | "unauthenticated" | "permission-denied" | "not-found" | "failed-precondition";

export class CoreError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "failed-precondition": 409,
};
