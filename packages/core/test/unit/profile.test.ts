import { describe, expect, it } from "vitest";
import { nameFromClaims } from "../../src/profile";

describe("nameFromClaims", () => {
  it("takes the first name from the name claim", () => {
    expect(nameFromClaims("Ada Obi", "ada.obi@example.com")).toBe("Ada");
    expect(nameFromClaims("  Ada   Lovelace Byron ", "a@example.com")).toBe("Ada");
    expect(nameFromClaims("Ada", "a@example.com")).toBe("Ada");
  });

  it("falls back to the part of the email before the @", () => {
    expect(nameFromClaims(undefined, "grace.hopper@example.com")).toBe("grace.hopper");
    expect(nameFromClaims("", "grace@example.com")).toBe("grace");
    expect(nameFromClaims("   ", "grace@example.com")).toBe("grace");
    expect(nameFromClaims(42, "grace@example.com")).toBe("grace");
  });

  it("returns nothing to use when there is neither", () => {
    expect(nameFromClaims(undefined, undefined)).toBe("");
  });
});
