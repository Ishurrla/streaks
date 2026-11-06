import { describe, expect, it } from "vitest";
import { authErrorFromCode, isEmail, safeNext, validateAuth } from "./validation";

describe("validateAuth", () => {
  it("returns the prototype's messages", () => {
    expect(validateAuth("signup", { name: " ", email: "nope", password: "short" })).toEqual({
      name: "Tell us what to call you.",
      email: "Enter an email like name@example.com.",
      password: "Use at least 8 characters.",
    });
  });

  it("does not ask for a name when logging in", () => {
    expect(validateAuth("login", { name: "", email: "ada@example.com", password: "12345678" })).toEqual({});
  });
});

describe("authErrorFromCode", () => {
  it("puts known errors on the right field", () => {
    expect(authErrorFromCode("auth/email-already-in-use")).toHaveProperty("email");
    expect(authErrorFromCode("auth/invalid-credential")).toHaveProperty("form");
    expect(authErrorFromCode("auth/something-new")).toHaveProperty("form");
  });
});

describe("safeNext", () => {
  it("only allows local paths", () => {
    expect(safeNext("/progress")).toBe("/progress");
    expect(safeNext("https://evil.example")).toBe("/today");
    expect(safeNext("//evil.example")).toBe("/today");
    expect(safeNext("/\\evil.example")).toBe("/today");
    expect(safeNext(null)).toBe("/today");
  });
});

describe("isEmail", () => {
  it("accepts something@something.something, around spaces", () => {
    for (const v of ["a@b.c", "name@example.com", " ada@example.com ", "first.last@mail.example.co.uk"]) {
      expect(isEmail(v), v).toBe(true);
    }
  });

  it("refuses anything missing a part, or with a space inside", () => {
    for (const v of ["", "a", "a@b", "@b.c", "a@.c", "a@b.", "a.b@c", "a b@c.d", "a@b .c", "a@b.	c"]) {
      expect(isEmail(v), JSON.stringify(v)).toBe(false);
    }
  });

  it("keeps the old pattern's leniency: extra @ and dots are fine where it allowed them", () => {
    // The same answers as /^\S+@\S+\.\S+$/, which the check replaced.
    for (const v of ["a@b@c.d", "@@a.a", "a@@b.c", "a@a..", "a@b.c.d"]) {
      expect(isEmail(v), v).toBe(true);
    }
  });

  it("stays fast on very long input", () => {
    const start = performance.now();
    expect(isEmail(`a@${"a".repeat(100_000)}@`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
