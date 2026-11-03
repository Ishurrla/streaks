import { FirebaseError } from "firebase/app";
import { EmailAuthProvider, linkWithCredential, updatePassword, type User } from "firebase/auth";

/**
 * Adds a password to a signed-in Google-only account, keeping its email. The Auth emulator
 * refuses to link a password under the account's own email, treating that email as taken;
 * updatePassword reaches the same result there. Call after reauthenticating.
 */
export async function addPassword(user: User, password: string): Promise<void> {
  if (!user.email) throw new Error("This account has no email");
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch (err) {
    if (!(err instanceof FirebaseError) || err.code !== "auth/email-already-in-use") throw err;
    await updatePassword(user, password);
  }
}
