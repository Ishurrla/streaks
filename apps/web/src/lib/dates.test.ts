import { describe, expect, it } from "vitest";
import { addDays, greeting, localToday, monthDays, shiftMonth, weekdayShort } from "./dates";

describe("display dates", () => {
  it("finds today in the saved timezone, not the browser's", () => {
    const instant = new Date("2026-12-31T22:30:00Z");
    expect(localToday("Africa/Lagos", instant)).toBe("2026-12-31");
    expect(localToday("Asia/Tokyo", instant)).toBe("2027-01-01");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("builds a Monday-first month grid", () => {
    // 1 October 2026 is a Thursday: three blank cells (Mon, Tue, Wed).
    const { lead, dates } = monthDays({ year: 2026, month: 9 });
    expect(lead).toBe(3);
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-10-01");
    expect(weekdayShort("2026-10-01")).toBe("Th");
  });

  it("moves between months across a year end", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("greeting", () => {
  it("changes at noon and at six in the evening, local time", () => {
    expect(greeting("UTC", new Date("2026-11-06T11:59:00Z"))).toBe("Good morning");
    expect(greeting("UTC", new Date("2026-11-06T12:00:00Z"))).toBe("Good afternoon");
    expect(greeting("UTC", new Date("2026-11-06T17:59:00Z"))).toBe("Good afternoon");
    expect(greeting("UTC", new Date("2026-11-06T18:00:00Z"))).toBe("Good evening");
    expect(greeting("UTC", new Date("2026-11-06T00:00:00Z"))).toBe("Good morning");
  });

  it("uses the hour in the given time zone", () => {
    // 11:30 UTC is 12:30 in Lagos and 20:30 in Tokyo.
    const now = new Date("2026-11-06T11:30:00Z");
    expect(greeting("UTC", now)).toBe("Good morning");
    expect(greeting("Africa/Lagos", now)).toBe("Good afternoon");
    expect(greeting("Asia/Tokyo", now)).toBe("Good evening");
  });
});
