/** Provider IDs as they appear in a Firebase user's providerData. */
export const PASSWORD_PROVIDER = "password";
export const GOOGLE_PROVIDER = "google.com";
export const GITHUB_PROVIDER = "github.com";

/** The sign-in providers that open a window (Google and GitHub). */
export type PopupProvider = typeof GOOGLE_PROVIDER | typeof GITHUB_PROVIDER;

export const PROVIDER_NAME: Record<PopupProvider, string> = {
  [GOOGLE_PROVIDER]: "Google",
  [GITHUB_PROVIDER]: "GitHub",
};

/** Our own code for a GitHub account that shared no email; never a Firebase one. */
export const NO_EMAIL_CODE = "streaks/no-verified-email";

/** How an existing account with the same email signs in, if Firebase will say. */
export type ExistingMethod = typeof PASSWORD_PROVIDER | PopupProvider | null;

/**
 * Picks the method to send someone to, from fetchSignInMethodsForEmail. It returns nothing
 * when email enumeration protection is on (the default for new projects), so null is common.
 */
export function existingMethod(methods: readonly string[], trying: PopupProvider): ExistingMethod {
  if (methods.includes(PASSWORD_PROVIDER)) return PASSWORD_PROVIDER;
  for (const p of [GOOGLE_PROVIDER, GITHUB_PROVIDER] as const) {
    if (p !== trying && methods.includes(p)) return p;
  }
  return null;
}

export type NoteAction = "go-to-login" | "retry" | "use-google" | "use-github";

export interface AuthNote {
  kind: "info" | "error";
  title: string;
  body: string;
  /** The button under the note, if any. */
  action?: { label: string; does: NoteAction };
}

/**
 * What the sign-up and log-in screens show when Google or GitHub sign-in fails. Never the
 * raw Firebase message. `existing` matters only for an email that already has an account.
 */
export function signInNote(provider: PopupProvider, code: string | undefined, existing: ExistingMethod = null): AuthNote {
  const name = PROVIDER_NAME[provider];
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return { kind: "info", title: "Sign-in cancelled", body: "No problem. Try again whenever you are ready." };
    case "auth/popup-blocked":
      return { kind: "error", title: `Your browser blocked the ${name} window`, body: "Allow pop-ups for this site, then try again." };
    case "auth/account-exists-with-different-credential": {
      const later = `You can connect ${name} afterwards in Settings.`;
      if (existing === PASSWORD_PROVIDER) {
        return {
          kind: "error",
          title: "This email already has an account",
          body: `Log in with your password first. ${later}`,
          action: { label: "Log in with email", does: "go-to-login" },
        };
      }
      if (existing === GOOGLE_PROVIDER || existing === GITHUB_PROVIDER) {
        const other = PROVIDER_NAME[existing];
        return {
          kind: "error",
          title: "This email already has an account",
          body: `Log in with ${other} first. ${later}`,
          action: { label: `Use ${other} instead`, does: existing === GOOGLE_PROVIDER ? "use-google" : "use-github" },
        };
      }
      return { kind: "error", title: "This email already has an account", body: `Log in with the method you used before. ${later}` };
    }
    case NO_EMAIL_CODE:
      return {
        kind: "error",
        title: `${name} did not share a verified email`,
        body: `Add or verify an email in your ${name} settings, then try again. Or sign up with your email instead.`,
      };
    case "auth/operation-not-allowed":
      return { kind: "error", title: `${name} sign-in is not available right now`, body: "Use your email for now, or try again later." };
    case "auth/network-request-failed":
      return {
        kind: "error",
        title: `Could not reach ${name}`,
        body: "Check your connection, then try again.",
        action: { label: "Try again", does: "retry" },
      };
    default:
      return {
        kind: "error",
        title: `Could not sign in with ${name}`,
        body: "Something went wrong. Try again.",
        action: { label: "Try again", does: "retry" },
      };
  }
}

export const googleSignInNote = (code: string | undefined, existing: ExistingMethod = null) =>
  signInNote(GOOGLE_PROVIDER, code, existing);

/**
 * The message for a Google or GitHub window opened from Settings: connecting, or confirming
 * it is you. Null when the person closed it themselves, which needs no message there.
 */
export function settingsError(provider: PopupProvider, code: string | undefined): string | null {
  const name = PROVIDER_NAME[provider];
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null;
    case "auth/popup-blocked":
      return `Your browser blocked the ${name} window. Allow pop-ups and try again.`;
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return provider === GITHUB_PROVIDER
        ? "That GitHub account is already connected to a different Streaks account."
        : "That Google account is already connected to another Streaks account.";
    case "auth/user-mismatch":
      return `Choose the ${name} account you use for Streaks.`;
    default:
      return `Something went wrong with ${name}. Try again.`;
  }
}

export const googleSettingsError = (code: string | undefined) => settingsError(GOOGLE_PROVIDER, code);

/** Removing a method is only allowed if the account has it and another way in remains. */
export function canDisconnect(providers: readonly string[], provider: string): boolean {
  return providers.includes(provider) && providers.some((p) => p !== provider);
}

/** True when this method is the account's only way in, so it must not be removed. */
export function isOnlyWayIn(providers: readonly string[], provider: string): boolean {
  return providers.includes(provider) && !canDisconnect(providers, provider);
}

/**
 * The window that confirms it is you for an account with no password (to set one, or to
 * delete the account): Google if connected, else GitHub. Null when there is a password.
 */
export function reauthProvider(providers: readonly string[]): PopupProvider | null {
  if (providers.includes(PASSWORD_PROVIDER)) return null;
  if (providers.includes(GOOGLE_PROVIDER)) return GOOGLE_PROVIDER;
  if (providers.includes(GITHUB_PROVIDER)) return GITHUB_PROVIDER;
  return null;
}

/** "your password or Google": the ways in that remain after removing `provider`. */
export function remainingMethods(providers: readonly string[], provider: string): string {
  const left = providers
    .filter((p) => p !== provider)
    .map((p) => (p === PASSWORD_PROVIDER ? "your password" : (PROVIDER_NAME[p as PopupProvider] ?? null)))
    .filter((p): p is string => !!p);
  return left.join(" or ");
}

export function validateNewPassword(password: string, confirm: string): { password?: string; confirm?: string } {
  if (password.length < 8) return { password: "Use at least 8 characters." };
  if (password !== confirm) return { confirm: "Those passwords do not match." };
  return {};
}

/** First name for the welcome screen, from the profile or provider name, else the email. */
export function welcomeName(name: string | null | undefined, email: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "friend";
}
