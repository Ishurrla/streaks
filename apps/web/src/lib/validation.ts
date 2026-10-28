export type AuthMode = "signup" | "login";

export interface AuthFields {
  name: string;
  email: string;
  password: string;
}

export type AuthErrors = Partial<Record<keyof AuthFields | "form", string>>;

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
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
