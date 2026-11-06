import { describe, expect, it } from "vitest";
import {
  canDisconnect,
  existingMethod,
  GITHUB_PROVIDER as GITHUB,
  GOOGLE_PROVIDER as GOOGLE,
  isOnlyWayIn,
  NO_EMAIL_CODE,
  PASSWORD_PROVIDER as PASSWORD,
  reauthProvider,
  remainingMethods,
  settingsError,
  signInNote,
  validateNewPassword,
  welcomeName,
} from "./sign-in";

const EXISTS = "auth/account-exists-with-different-credential";

describe("signInNote", () => {
  for (const provider of [GOOGLE, GITHUB] as const) {
    const name = provider === GOOGLE ? "Google" : "GitHub";

    it(`${name}: treats a closed or replaced popup as a calm note, not an error`, () => {
      for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]) {
        expect(signInNote(provider, code)).toEqual({
          kind: "info",
          title: "Sign-in cancelled",
          body: "No problem. Try again whenever you are ready.",
        });
      }
    });

    it(`${name}: explains a blocked popup`, () => {
      expect(signInNote(provider, "auth/popup-blocked")).toEqual({
        kind: "error",
        title: `Your browser blocked the ${name} window`,
        body: "Allow pop-ups for this site, then try again.",
      });
    });

    it(`${name}: an existing password account goes to the log-in tab`, () => {
      expect(signInNote(provider, EXISTS, PASSWORD)).toEqual({
        kind: "error",
        title: "This email already has an account",
        body: `Log in with your password first. You can connect ${name} afterwards in Settings.`,
        action: { label: "Log in with email", does: "go-to-login" },
      });
    });

    it(`${name}: when the method cannot be told, a generic note with no button`, () => {
      expect(signInNote(provider, EXISTS, null)).toEqual({
        kind: "error",
        title: "This email already has an account",
        body: `Log in with the method you used before. You can connect ${name} afterwards in Settings.`,
      });
      expect(signInNote(provider, EXISTS).action).toBeUndefined();
    });

    it(`${name}: never shows Firebase's own wording, and offers a retry where it can help`, () => {
      for (const code of ["auth/internal-error", "auth/unauthorized-domain", "auth/network-request-failed", undefined]) {
        const note = signInNote(provider, code);
        expect(note.kind).toBe("error");
        expect(note.action?.does).toBe("retry");
        expect(`${note.title} ${note.body}`).not.toMatch(/auth\/|Firebase/i);
      }
    });

    it(`${name}: a provider switched off in Firebase gets a calm, retry-free message`, () => {
      const note = signInNote(provider, "auth/operation-not-allowed");
      expect(note).toEqual({ kind: "error", title: `${name} sign-in is not available right now`, body: "Use your email for now, or try again later." });
    });
  }

  it("GitHub over a Google account offers Google, and the reverse", () => {
    expect(signInNote(GITHUB, EXISTS, GOOGLE)).toEqual({
      kind: "error",
      title: "This email already has an account",
      body: "Log in with Google first. You can connect GitHub afterwards in Settings.",
      action: { label: "Use Google instead", does: "use-google" },
    });
    expect(signInNote(GOOGLE, EXISTS, GITHUB).action).toEqual({ label: "Use GitHub instead", does: "use-github" });
  });

  it("explains a GitHub account that shared no email", () => {
    expect(signInNote(GITHUB, NO_EMAIL_CODE)).toEqual({
      kind: "error",
      title: "GitHub did not share a verified email",
      body: "Add or verify an email in your GitHub settings, then try again. Or sign up with your email instead.",
    });
  });
});

describe("existingMethod", () => {
  it("prefers the password, then the other provider", () => {
    expect(existingMethod([GOOGLE, PASSWORD], GITHUB)).toBe(PASSWORD);
    expect(existingMethod([GOOGLE], GITHUB)).toBe(GOOGLE);
    expect(existingMethod([GITHUB], GOOGLE)).toBe(GITHUB);
  });

  it("is unknown when Firebase says nothing (email enumeration protection) or names the same provider", () => {
    expect(existingMethod([], GITHUB)).toBeNull();
    expect(existingMethod([GITHUB], GITHUB)).toBeNull();
    expect(existingMethod(["emailLink"], GITHUB)).toBeNull();
  });
});

describe("settingsError", () => {
  it("says nothing when the person closed the window", () => {
    for (const p of [GOOGLE, GITHUB] as const) {
      expect(settingsError(p, "auth/popup-closed-by-user")).toBeNull();
      expect(settingsError(p, "auth/cancelled-popup-request")).toBeNull();
    }
  });

  it("has GitHub's message for each case Settings can hit", () => {
    expect(settingsError(GITHUB, "auth/popup-blocked")).toBe("Your browser blocked the GitHub window. Allow pop-ups and try again.");
    expect(settingsError(GITHUB, "auth/credential-already-in-use")).toBe(
      "That GitHub account is already connected to a different Streaks account.",
    );
    expect(settingsError(GITHUB, "auth/user-mismatch")).toBe("Choose the GitHub account you use for Streaks.");
    expect(settingsError(GITHUB, "auth/internal-error")).toBe("Something went wrong with GitHub. Try again.");
  });

  it("keeps Google's messages", () => {
    expect(settingsError(GOOGLE, "auth/popup-blocked")).toBe("Your browser blocked the Google window. Allow pop-ups and try again.");
    expect(settingsError(GOOGLE, "auth/credential-already-in-use")).toBe("That Google account is already connected to another Streaks account.");
    expect(settingsError(GOOGLE, "auth/email-already-in-use")).toBe("That Google account is already connected to another Streaks account.");
    expect(settingsError(GOOGLE, "auth/user-mismatch")).toBe("Choose the Google account you use for Streaks.");
    expect(settingsError(GOOGLE, undefined)).toBe("Something went wrong with Google. Try again.");
  });
});

describe("the last way in", () => {
  it("can be disconnected only while another method remains", () => {
    expect(canDisconnect([PASSWORD, GITHUB], GITHUB)).toBe(true);
    expect(canDisconnect([GOOGLE, GITHUB], GITHUB)).toBe(true);
    expect(canDisconnect([GITHUB], GITHUB)).toBe(false);
    expect(canDisconnect([GOOGLE], GOOGLE)).toBe(false);
    expect(canDisconnect([PASSWORD], PASSWORD)).toBe(false);
  });

  it("cannot remove a method the account does not have", () => {
    expect(canDisconnect([PASSWORD], GITHUB)).toBe(false);
    expect(canDisconnect([], GITHUB)).toBe(false);
  });

  it("marks the only method, and only that", () => {
    expect(isOnlyWayIn([GITHUB], GITHUB)).toBe(true);
    expect(isOnlyWayIn([PASSWORD], PASSWORD)).toBe(true);
    expect(isOnlyWayIn([PASSWORD, GITHUB], GITHUB)).toBe(false);
    expect(isOnlyWayIn([PASSWORD], GITHUB)).toBe(false);
  });

  it("names what remains for the disconnect question", () => {
    expect(remainingMethods([PASSWORD, GOOGLE, GITHUB], GITHUB)).toBe("your password or Google");
    expect(remainingMethods([PASSWORD, GITHUB], GITHUB)).toBe("your password");
    expect(remainingMethods([GOOGLE, GITHUB], GITHUB)).toBe("Google");
  });
});

describe("reauthProvider", () => {
  it("confirms an account without a password through Google, else GitHub", () => {
    expect(reauthProvider([GOOGLE])).toBe(GOOGLE);
    expect(reauthProvider([GITHUB])).toBe(GITHUB);
    expect(reauthProvider([GITHUB, GOOGLE])).toBe(GOOGLE);
  });

  it("is null when there is a password to use", () => {
    expect(reauthProvider([PASSWORD, GITHUB])).toBeNull();
    expect(reauthProvider([PASSWORD])).toBeNull();
    expect(reauthProvider([])).toBeNull();
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
