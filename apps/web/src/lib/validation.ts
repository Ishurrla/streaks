export type AuthMode = "signup" | "login";

export interface AuthFields {
  name: string;
  email: string;
  password: string;
}

export type AuthErrors = Partial<Record<keyof AuthFields | "form", string>>;

/**
 * A quick shape check before Firebase checks it properly: something@something.something,
 * with no spaces. Done without a regex, in one pass, so long input cannot slow it down
 * (/^\S+@\S+\.\S+$/ could backtrack). It accepts exactly what that regex accepted, using the
 * places it could match most easily: the first "@" after the first character, and the last
 * "." that still has a character after it.
 */
export function isEmail(value: string): boolean {
  const v = value.trim();
  if (/\s/.test(v)) return false;
  const at = v.indexOf("@", 1);
  const dot = v.lastIndexOf(".", v.length - 2);
  return at >= 1 && dot >= at + 2;
}

/** Client-side checks, with the messages from the design prototype. */
export function validateAuth(mode: AuthMode, fields: AuthFields): AuthErrors {
  const errors: AuthErrors = {};
  if (mode === "signup" && !fields.name.trim()) errors.name = "Tell us what to call you.";
  if (!isEmail(fields.email)) errors.email = "Enter an email like name@example.com.";
  if (fields.password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
}

/** Maps Firebase Auth error codes to a message and the field it belongs to. */
export function authErrorFromCode(code: string | undefined): AuthErrors {
  switch (code) {
    case "auth/email-already-in-use":
      return { email: "That email already has an account. Log in instead." };
    case "auth/invalid-email":
      return { email: "Enter an email like name@example.com." };
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return { password: "Use at least 8 characters." };
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return { form: "That email and password do not match." };
    case "auth/user-disabled":
      return { form: "This account has been switched off." };
    case "auth/too-many-requests":
      return { form: "Too many tries. Wait a minute and try again." };
    case "auth/network-request-failed":
      return { form: "Could not reach the server. Check your connection and try again." };
    default:
      return { form: "Something went wrong. Try again." };
  }
}

/** Only allow same-site relative paths as a post-login destination. */
export function safeNext(next: string | null | undefined, fallback = "/today"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
