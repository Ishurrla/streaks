import { CoreError } from "./errors";
import { auth, db } from "./admin";

/** How recently the caller must have signed in (or re-entered their password). */
export const RECENT_LOGIN_SECONDS = 5 * 60;

/**
 * Deletes everything under users/{uid} (habits, check-ins, freezes, push tokens), then
 * the Auth user. Requires a recent sign-in, so a stolen long-lived session cannot wipe
 * an account. Safe to retry: every step is a no-op once done.
 *
 * The Auth user is disabled first. Otherwise an open app, seeing its profile vanish,
 * could call ensureProfile and recreate it before the user is gone (ensureProfile
 * refuses disabled users).
 */
export async function deleteAccountFor(uid: string, authTimeSeconds: number | undefined, now: Date) {
  if (!authTimeSeconds || now.getTime() / 1000 - authTimeSeconds > RECENT_LOGIN_SECONDS) {
    throw new CoreError("failed-precondition", "Sign in again to delete your account.", {
      reason: "requires-recent-login",
    });
  }
  try {
    await auth().updateUser(uid, { disabled: true });
    await db().recursiveDelete(db().collection("users").doc(uid));
    await auth().deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    // The Auth user is already gone (a retry); make sure the data is too.
    await db().recursiveDelete(db().collection("users").doc(uid));
  }
  return { deleted: true };
}
