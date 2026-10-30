import { describe, expect, it } from "vitest";
import { addDays, computeStreaks, dayNumber } from "../../src/streaks";

const TODAY = "2026-10-28";

describe("computeStreaks", () => {
  it("is all zero with no history", () => {
    expect(computeStreaks([], [], TODAY)).toEqual({ currentStreak: 0, bestStreak: 0, lastCheckInDate: null });
  });

  it("counts today only as a streak of 1", () => {
    expect(computeStreaks([TODAY], [], TODAY)).toEqual({ currentStreak: 1, bestStreak: 1, lastCheckInDate: TODAY });
  });

  it("keeps a streak alive (at risk) when only yesterday is done", () => {
    expect(computeStreaks(["2026-10-27"], [], TODAY)).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastCheckInDate: "2026-10-27",
    });
    expect(computeStreaks(["2026-10-25", "2026-10-26", "2026-10-27"], [], TODAY).currentStreak).toBe(3);
  });

  it("resets the current streak after a missed day", () => {
    // 26th done, 27th missed, today not done yet.
    expect(computeStreaks(["2026-10-25", "2026-10-26"], [], TODAY).currentStreak).toBe(0);
    // Missed the 26th, then done the 27th and today.
    expect(computeStreaks(["2026-10-24", "2026-10-25", "2026-10-27", TODAY], [], TODAY).currentStreak).toBe(2);
  });

  it("keeps the best streak after a reset", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-27", TODAY];
    expect(computeStreaks(dates, [], TODAY)).toEqual({ currentStreak: 2, bestStreak: 5, lastCheckInDate: TODAY });
  });

  it("bridges one missed day with a freeze", () => {
    const stats = computeStreaks(["2026-10-25", "2026-10-26", TODAY], ["2026-10-27"], TODAY);
    expect(stats).toEqual({ currentStreak: 4, bestStreak: 4, lastCheckInDate: TODAY });
  });

  it("does not treat a freeze as the last check-in date", () => {
    expect(computeStreaks(["2026-10-26"], ["2026-10-27"], TODAY)).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      lastCheckInDate: "2026-10-26",
    });
  });

  it("counts across a month boundary", () => {
    expect(computeStreaks(["2026-09-29", "2026-09-30", "2026-10-01"], [], "2026-10-01").currentStreak).toBe(3);
    // February in a non-leap year.
    expect(computeStreaks(["2027-02-27", "2027-02-28", "2027-03-01"], [], "2027-03-01").currentStreak).toBe(3);
    // Leap day.
    expect(computeStreaks(["2028-02-28", "2028-02-29", "2028-03-01"], [], "2028-03-01").currentStreak).toBe(3);
    expect(computeStreaks(["2028-02-28", "2028-03-01"], [], "2028-03-01").currentStreak).toBe(1);
  });

  it("counts across a year boundary", () => {
    expect(computeStreaks(["2026-12-30", "2026-12-31", "2027-01-01"], [], "2027-01-01")).toEqual({
      currentStreak: 3,
      bestStreak: 3,
      lastCheckInDate: "2027-01-01",
    });
    // At risk on 1 Jan with 31 Dec done.
    expect(computeStreaks(["2026-12-30", "2026-12-31"], [], "2027-01-01").currentStreak).toBe(2);
  });

  it("ignores duplicates, order, future dates and malformed dates", () => {
    const stats = computeStreaks(
      [TODAY, "2026-10-27", TODAY, "2026-10-26", "2026-10-29", "2026-02-30", "garbage"],
      ["2026-10-30"],
      TODAY,
    );
    expect(stats).toEqual({ currentStreak: 3, bestStreak: 3, lastCheckInDate: TODAY });
  });

  it("throws on an invalid today", () => {
    expect(() => computeStreaks([], [], "28/10/2026")).toThrow();
  });
});

describe("date helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("rejects impossible dates", () => {
    expect(dayNumber("2026-02-29")).toBeNaN();
    expect(dayNumber("2026-13-01")).toBeNaN();
  });
});
