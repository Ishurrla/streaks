import { describe, expect, it } from "vitest";
import {
  applyPendingDays,
  changeDays,
  describeDays,
  earnedMilestones,
  isValidDays,
  newMilestones,
  nextMilestone,
  nextScheduledAfter,
  scheduledOn,
  weekdayOf,
  type HabitSchedule,
} from "../../src/schedule";
import { computeStreaks } from "../../src/streaks";
import { localDate } from "../../src/time";

// October 2026: the 26th is a Monday, the 28th a Wednesday, the 31st a Saturday.
const MWF: HabitSchedule = { days: [0, 2, 4] };
const WEEKEND: HabitSchedule = { days: [5, 6] };
const streaks = (habit: HabitSchedule, checkIns: string[], today: string, freezes: string[] = []) =>
  computeStreaks(checkIns, freezes, today, (d) => scheduledOn(habit, d));

describe("weekdayOf", () => {
  it("numbers days from Monday = 0", () => {
    expect(weekdayOf("2026-10-26")).toBe(0);
    expect(weekdayOf("2026-10-28")).toBe(2);
    expect(weekdayOf("2026-11-01")).toBe(6);
    expect(weekdayOf("1970-01-01")).toBe(3); // a Thursday
    expect(weekdayOf("1969-12-29")).toBe(0); // before the epoch too
  });

  it("follows the user's local date, not UTC", () => {
    // Sunday 1 Nov 22:00Z is already Monday the 2nd in Tokyo.
    const now = new Date("2026-11-01T22:00:00Z");
    expect(weekdayOf(localDate(now, "UTC"))).toBe(6);
    expect(weekdayOf(localDate(now, "Asia/Tokyo"))).toBe(0);
    expect(scheduledOn(WEEKEND, localDate(now, "UTC"))).toBe(true);
    expect(scheduledOn(WEEKEND, localDate(now, "Asia/Tokyo"))).toBe(false);
  });
});

describe("isValidDays", () => {
  it("accepts 1 to 7 unique integers from 0 to 6", () => {
    expect(isValidDays([0])).toBe(true);
    expect(isValidDays([6, 0, 3])).toBe(true);
    expect(isValidDays([0, 1, 2, 3, 4, 5, 6])).toBe(true);
  });

  it("rejects everything else", () => {
    for (const bad of [[], [7], [-1], [1.5], [1, 1], ["1"], null, "0,1", [0, 1, 2, 3, 4, 5, 6, 0]]) {
      expect(isValidDays(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("scheduledOn", () => {
  it("treats a habit with no days as every day", () => {
    for (let d = 26; d <= 31; d++) expect(scheduledOn({}, `2026-10-${d}`)).toBe(true);
    expect(scheduledOn({ days: null }, "2026-11-01")).toBe(true);
  });

  it("uses a pending change from its start date only", () => {
    const habit: HabitSchedule = { days: [0, 1, 2, 3, 4, 5, 6], nextDays: [5, 6], nextDaysFrom: "2026-10-29" };
    expect(scheduledOn(habit, "2026-10-28")).toBe(true); // Wednesday, before the change
    expect(scheduledOn(habit, "2026-10-29")).toBe(false); // Thursday, after it
    expect(scheduledOn(habit, "2026-10-31")).toBe(true); // Saturday
  });

  it("judges past days by the schedule that applied then", () => {
    const habit: HabitSchedule = { days: [5, 6], pastDays: [{ until: "2026-10-28", days: [0, 1, 2, 3, 4, 5, 6] }] };
    expect(scheduledOn(habit, "2026-10-27")).toBe(true); // Tuesday under the old every-day schedule
    expect(scheduledOn(habit, "2026-11-03")).toBe(false); // Tuesday now
  });

  it("finds the next scheduled day", () => {
    expect(nextScheduledAfter(MWF, "2026-10-28")).toBe("2026-10-30");
    expect(nextScheduledAfter(WEEKEND, "2026-11-01")).toBe("2026-11-07");
  });
});

describe("changeDays", () => {
  it("starts the change tomorrow and leaves today alone", () => {
    const update = changeDays({}, [0, 2, 4], "2026-10-28");
    expect(update).toEqual({ days: [0, 1, 2, 3, 4, 5, 6], nextDays: [0, 2, 4], nextDaysFrom: "2026-10-29", pastDays: [] });
    expect(scheduledOn(update, "2026-10-28")).toBe(true);
    expect(scheduledOn(update, "2026-10-29")).toBe(false); // Thursday
  });

  it("replaces a change that has not started, and cancels it when the days go back", () => {
    const first = changeDays({}, [5, 6], "2026-10-28");
    expect(changeDays(first, [0], "2026-10-28")).toMatchObject({ nextDays: [0], nextDaysFrom: "2026-10-29" });
    expect(changeDays(first, [6, 5, 4, 3, 2, 1, 0], "2026-10-28")).toMatchObject({ nextDays: null, nextDaysFrom: null });
  });

  it("applies a change that has started before making the next one", () => {
    const habit = changeDays({}, [5, 6], "2026-10-28");
    const later = changeDays(habit, [0], "2026-11-02");
    expect(later).toEqual({
      days: [5, 6],
      nextDays: [0],
      nextDaysFrom: "2026-11-03",
      pastDays: [{ until: "2026-10-28", days: [0, 1, 2, 3, 4, 5, 6] }],
    });
  });

  it("applyPendingDays keeps the old days for the past and is a no-op before the start", () => {
    const habit = changeDays({}, [0, 2, 4], "2026-10-28");
    expect(applyPendingDays(habit, "2026-10-28")).toBeNull();
    const applied = applyPendingDays(habit, "2026-10-29")!;
    expect(applied).toEqual({ days: [0, 2, 4], nextDays: null, nextDaysFrom: null, pastDays: [{ until: "2026-10-28", days: [0, 1, 2, 3, 4, 5, 6] }] });
    // Every day judges the same before and after applying.
    for (let d = 20; d <= 31; d++) {
      expect(scheduledOn(applied, `2026-10-${d}`)).toBe(scheduledOn(habit, `2026-10-${d}`));
    }
  });

  it("describes days the way the sheet does", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([4, 3, 2, 1, 0])).toBe("Weekdays");
    expect(describeDays([6, 5])).toBe("Weekends");
    expect(describeDays([4, 0, 2])).toBe("Mon · Wed · Fri");
  });
});

describe("computeStreaks with a schedule", () => {
  it("is unchanged for an every-day habit", () => {
    const dates = ["2026-10-25", "2026-10-26", "2026-10-28"];
    expect(streaks({}, dates, "2026-10-28")).toEqual(computeStreaks(dates, [], "2026-10-28"));
    expect(streaks({ days: [0, 1, 2, 3, 4, 5, 6] }, dates, "2026-10-28")).toEqual(computeStreaks(dates, [], "2026-10-28"));
  });

  it("skips rest days for Mon/Wed/Fri", () => {
    // Mon 19, Wed 21, Fri 23, Mon 26, Wed 28: five in a row, the days between are rest days.
    const dates = ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28"];
    expect(streaks(MWF, dates, "2026-10-28")).toEqual({ currentStreak: 5, bestStreak: 5, lastCheckInDate: "2026-10-28" });
    // Thursday 29 and Saturday 31 are rest days: still alive, not at zero.
    expect(streaks(MWF, dates, "2026-10-29").currentStreak).toBe(5);
    // Friday 30 not done yet: at risk, still 5.
    expect(streaks(MWF, dates, "2026-10-30").currentStreak).toBe(5);
    // Friday 30 missed: broken by Saturday.
    expect(streaks(MWF, dates, "2026-10-31")).toMatchObject({ currentStreak: 0, bestStreak: 5 });
  });

  it("counts a weekend-only habit across the week", () => {
    const dates = ["2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25"];
    expect(streaks(WEEKEND, dates, "2026-10-30").currentStreak).toBe(4); // Friday: the weekdays rest
    expect(streaks(WEEKEND, dates, "2026-11-01").currentStreak).toBe(0); // Sat 31 missed
    expect(streaks(WEEKEND, [...dates, "2026-10-31"], "2026-11-01").currentStreak).toBe(5); // Sunday still open
  });

  it("does not count a pending change until it starts", () => {
    // Every day until today (Wed 28), weekends from tomorrow. Today's streak is unchanged.
    const habit = changeDays({}, [5, 6], "2026-10-28");
    const dates = ["2026-10-26", "2026-10-27", "2026-10-28"];
    expect(streaks(habit, dates, "2026-10-28").currentStreak).toBe(3);
    // Thursday and Friday rest under the new days, so the streak survives to Saturday.
    expect(streaks(habit, dates, "2026-10-31").currentStreak).toBe(3);
    expect(streaks(habit, [...dates, "2026-10-31"], "2026-10-31").currentStreak).toBe(4);
  });

  it("crosses month and year boundaries over rest days", () => {
    // Fri 30 Oct, Mon 2 Nov, Wed 4 Nov.
    expect(streaks(MWF, ["2026-10-30", "2026-11-02", "2026-11-04"], "2026-11-04").currentStreak).toBe(3);
    // Wed 30 Dec 2026, Fri 1 Jan 2027, Mon 4 Jan.
    expect(streaks(MWF, ["2026-12-30", "2027-01-01", "2027-01-04"], "2027-01-05").currentStreak).toBe(3);
  });

  it("counts a freeze on a scheduled day and ignores rest days around it", () => {
    expect(streaks(MWF, ["2026-10-23", "2026-10-28"], "2026-10-28", ["2026-10-26"]).currentStreak).toBe(3);
  });
});

describe("milestones", () => {
  it("are earned the first time a streak reaches them", () => {
    expect(newMilestones([], 2)).toEqual([]);
    expect(newMilestones([], 3)).toEqual([3]);
    expect(newMilestones([3], 7)).toEqual([7]);
  });

  it("are not earned again after a reset", () => {
    expect(newMilestones([3, 7], 7)).toEqual([]);
    expect(newMilestones([3, 7], 3)).toEqual([]);
  });

  it("are backfilled from the best streak for habits from before milestones", () => {
    expect(earnedMilestones({ bestStreak: 15 })).toEqual([3, 7, 14]);
    expect(earnedMilestones({ bestStreak: 0 })).toEqual([]);
    expect(earnedMilestones({ milestonesEarned: [3], bestStreak: 15 })).toEqual([3]);
  });

  it("know the next one", () => {
    expect(nextMilestone(0)).toBe(3);
    expect(nextMilestone(7)).toBe(14);
    expect(nextMilestone(365)).toBeNull();
  });
});
