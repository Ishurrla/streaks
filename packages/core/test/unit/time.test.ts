import { describe, expect, it } from "vitest";
import { isValidTimezone, localDate, nextLocalMidnight } from "../../src/time";

describe("localDate", () => {
  it("gives a different date for the same instant in different time zones", () => {
    // 23:30 in Lagos (UTC+1) on 31 Dec is already 1 Jan in Tokyo (UTC+9).
    const instant = new Date("2026-12-31T22:30:00Z");
    expect(localDate(instant, "Africa/Lagos")).toBe("2026-12-31");
    expect(localDate(instant, "Asia/Tokyo")).toBe("2027-01-01");
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-12-31");
  });

  it("throws on an invalid timezone", () => {
    expect(() => localDate(new Date(), "Not/AZone")).toThrow();
    expect(() => nextLocalMidnight(new Date(), "Not/AZone")).toThrow();
  });
});

describe("nextLocalMidnight", () => {
  it("returns the next local midnight as a UTC instant", () => {
    const now = new Date("2026-10-28T10:00:00Z"); // 11:00 in Lagos
    expect(nextLocalMidnight(now, "Africa/Lagos").toISOString()).toBe("2026-10-28T23:00:00.000Z");
  });

  it("moves to the following day when it is exactly midnight", () => {
    const midnight = new Date("2026-10-28T23:00:00Z"); // 00:00 on the 29th in Lagos
    expect(nextLocalMidnight(midnight, "Africa/Lagos").toISOString()).toBe("2026-10-29T23:00:00.000Z");
  });

  it("follows DST changes", () => {
    // New York leaves DST on 1 Nov 2026, so midnight on 2 Nov is at UTC-5 (05:00Z), not UTC-4.
    const now = new Date("2026-11-01T12:00:00Z");
    expect(nextLocalMidnight(now, "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimezone("Africa/Lagos")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});
