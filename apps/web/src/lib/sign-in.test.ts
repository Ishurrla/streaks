import { describe, expect, it } from "vitest";
import {
  canDisconnect,
  GOOGLE_PROVIDER as GOOGLE,
  googleSettingsError,
  googleSignInNote,
  isGoogleOnly,
  PASSWORD_PROVIDER as PASSWORD,
  validateNewPassword,
  welcomeName,
} from "./sign-in";

describe("googleSignInNote", () => {
  it("treats a closed or replaced popup as a calm note, not an error", () => {
    for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request"]) {
      expect(googleSignInNote(code)).toEqual({
        kind: "info",
        title: "Sign-in cancelled",
        body: "No problem. Try again whenever you are ready.",
      });
    }
  });

  it("explains a blocked popup", () => {
    expect(googleSignInNote("auth/popup-blocked")).toEqual({
      kind: "error",
      title: "Your browser blocked the Google window",
      body: "Allow pop-ups for this site, then try again.",
    });
  });

  it("sends an existing email to the log-in tab", () => {
    expect(googleSignInNote("auth/account-exists-with-different-credential")).toEqual({
      kind: "error",
      title: "This email already has an account",
      body: "Log in with your password first. You can connect Google afterwards in Settings.",
      action: { label: "Log in with email", does: "go-to-login" },
    });
  });

  it("offers a retry for anything else", () => {
    for (const code of ["auth/network-request-failed", "auth/internal-error", "auth/unauthorized-domain", undefined]) {
      const note = googleSignInNote(code);
      expect(note.kind).toBe("error");
      expect(note.action?.does).toBe("retry");
    }
  });
});

describe("googleSettingsError", () => {
  it("says nothing when the person closed the window", () => {
    expect(googleSettingsError("auth/popup-closed-by-user")).toBeNull();
    expect(googleSettingsError("auth/cancelled-popup-request")).toBeNull();
  });

  it("has a message for each case Settings can hit", () => {
    expect(googleSettingsError("auth/popup-blocked")).toBe("Your browser blocked the Google window. Allow pop-ups and try again.");
    expect(googleSettingsError("auth/credential-already-in-use")).toBe("That Google account is already connected to another Streaks account.");
    expect(googleSettingsError("auth/email-already-in-use")).toBe("That Google account is already connected to another Streaks account.");
    expect(googleSettingsError("auth/user-mismatch")).toBe("Choose the Google account you use for Streaks.");
    expect(googleSettingsError("auth/internal-error")).toBe("Something went wrong with Google. Try again.");
    expect(googleSettingsError(undefined)).toBe("Something went wrong with Google. Try again.");
  });
});

describe("canDisconnect", () => {
  it("allows removing a method when another remains", () => {
    expect(canDisconnect([PASSWORD, GOOGLE], GOOGLE)).toBe(true);
    expect(canDisconnect([PASSWORD, GOOGLE], PASSWORD)).toBe(true);
  });

  it("refuses to remove the only way in", () => {
    expect(canDisconnect([GOOGLE], GOOGLE)).toBe(false);
    expect(canDisconnect([PASSWORD], PASSWORD)).toBe(false);
  });

  it("refuses to remove a method the account does not have", () => {
    expect(canDisconnect([PASSWORD], GOOGLE)).toBe(false);
    expect(canDisconnect([], GOOGLE)).toBe(false);
  });
});

describe("isGoogleOnly", () => {
  it("is true only for Google without a password", () => {
    expect(isGoogleOnly([GOOGLE])).toBe(true);
    expect(isGoogleOnly([PASSWORD, GOOGLE])).toBe(false);
    expect(isGoogleOnly([PASSWORD])).toBe(false);
    expect(isGoogleOnly([])).toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("needs 8 characters and a matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toEqual({ password: "Use at least 8 characters." });
    expect(validateNewPassword("long enough", "different")).toEqual({ confirm: "Those passwords do not match." });
    expect(validateNewPassword("long enough", "long enough")).toEqual({});
  });
});

describe("welcomeName", () => {
  it("uses the first name, then the email, then a stand-in", () => {
    expect(welcomeName("Ada Obi", "ada@example.com")).toBe("Ada");
    expect(welcomeName("  ", "ada.obi@example.com")).toBe("ada.obi");
    expect(welcomeName(null, null)).toBe("friend");
  });
});
