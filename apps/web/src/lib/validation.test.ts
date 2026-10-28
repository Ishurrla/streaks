import { describe, expect, it } from "vitest";
import { authErrorFromCode, safeNext, validateAuth } from "./validation";

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
