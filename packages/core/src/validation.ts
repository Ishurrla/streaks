import { CoreError } from "./errors";

export type Body = Record<string, unknown>;

/** A habit ID as sent by the client: a single Firestore document ID, nothing more. */
export function requireHabitId(body: Body): string {
  const { habitId } = body;
  if (typeof habitId !== "string" || habitId.length === 0 || habitId.length > 128 || habitId.includes("/")) {
    throw new CoreError("invalid-argument", "habitId must be a document ID.");
  }
  return habitId;
}

/** An optional string field: absent is fine, anything other than a short string is not. */
export function optionalString(body: Body, field: string, max = 200): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new CoreError("invalid-argument", `${field} must be a string of at most ${max} characters.`);
  }
  return value;
}
