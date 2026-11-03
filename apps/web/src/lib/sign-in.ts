/** Provider IDs as they appear in a Firebase user's providerData. */
export const PASSWORD_PROVIDER = "password";
export const GOOGLE_PROVIDER = "google.com";

export interface AuthNote {
  kind: "info" | "error";
  title: string;
  body: string;
  /** The button under the note, if any. */
  action?: { label: string; does: "go-to-login" | "retry" };
}

/** What the sign-up and log-in screens show when Google sign-in fails, with the prototype's wording. */
export function googleSignInNote(code: string | undefined): AuthNote {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return { kind: "info", title: "Sign-in cancelled", body: "No problem. Try again whenever you are ready." };
    case "auth/popup-blocked":
      return {
        kind: "error",
        title: "Your browser blocked the Google window",
        body: "Allow pop-ups for this site, then try again.",
      };
    case "auth/account-exists-with-different-credential":
      return {
        kind: "error",
        title: "This email already has an account",
        body: "Log in with your password first. You can connect Google afterwards in Settings.",
        action: { label: "Log in with email", does: "go-to-login" },
      };
    default:
      return {
        kind: "error",
        title: "Could not sign in with Google",
        body: "Something went wrong. Try again.",
        action: { label: "Try again", does: "retry" },
      };
  }
}

/**
 * The message for a Google window opened from Settings: connecting, or confirming it is you.
 * Null when the person closed it themselves, which needs no message there.
 */
export function googleSettingsError(code: string | undefined): string | null {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups and try again.";
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return "That Google account is already connected to another Streaks account.";
    case "auth/user-mismatch":
      return "Choose the Google account you use for Streaks.";
    default:
      return "Something went wrong with Google. Try again.";
  }
}

/** Removing a method is only allowed if the account has it and another way in remains. */
export function canDisconnect(providers: readonly string[], provider: string): boolean {
  return providers.includes(provider) && providers.some((p) => p !== provider);
}

/** The account has no password to confirm or reset, so it confirms through Google instead. */
export function isGoogleOnly(providers: readonly string[]): boolean {
  return providers.includes(GOOGLE_PROVIDER) && !providers.includes(PASSWORD_PROVIDER);
}

export function validateNewPassword(password: string, confirm: string): { password?: string; confirm?: string } {
  if (password.length < 8) return { password: "Use at least 8 characters." };
  if (password !== confirm) return { confirm: "Those passwords do not match." };
  return {};
}

/** First name for the welcome screen, from the profile or Google name, else the email. */
export function welcomeName(name: string | null | undefined, email: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "friend";
}
