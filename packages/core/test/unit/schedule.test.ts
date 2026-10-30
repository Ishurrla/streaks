import { describe, expect, it } from "vitest";
import { nextReminderAt } from "../../src/reminders";

const lagos = { timezone: "Africa/Lagos", reminderEnabled: true, reminderTime: "20:00", lastReminderDate: null };

describe("nextReminderAt", () => {
  it("is null with reminders off", () => {
    expect(nextReminderAt(new Date("2026-10-28T10:00:00Z"), { ...lagos, reminderEnabled: false })).toBeNull();
  });

  it("is today's reminder time, whether it is still ahead or already passed but not sent", () => {
    // 11:00 and 21:00 in Lagos both give 20:00 on the 28th (19:00Z).
    expect(nextReminderAt(new Date("2026-10-28T10:00:00Z"), lagos)).toEqual(new Date("2026-10-28T19:00:00Z"));
    expect(nextReminderAt(new Date("2026-10-28T20:00:00Z"), lagos)).toEqual(new Date("2026-10-28T19:00:00Z"));
  });

  it("is tomorrow's once today's was sent, today has closed, or today is skipped", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    const tomorrow = new Date("2026-10-29T19:00:00Z");
    expect(nextReminderAt(now, { ...lagos, lastReminderDate: "2026-10-28" })).toEqual(tomorrow);
    expect(nextReminderAt(now, { ...lagos, lastClosedDate: "2026-10-28" })).toEqual(tomorrow);
    expect(nextReminderAt(now, lagos, { skipToday: true })).toEqual(tomorrow);
  });

  it("uses the user's own timezone and day", () => {
    const now = new Date("2026-10-28T22:30:00Z"); // 23:30 on the 28th in Lagos, 07:30 on the 29th in Tokyo
    expect(nextReminderAt(now, { ...lagos, timezone: "Asia/Tokyo" })).toEqual(new Date("2026-10-29T11:00:00Z"));
    expect(nextReminderAt(now, { ...lagos, timezone: "America/Los_Angeles" })).toEqual(new Date("2026-10-29T03:00:00Z"));
  });

  it("follows daylight saving: 20:00 in Los Angeles is 04:00Z in winter and 03:00Z in summer", () => {
    const la = { ...lagos, timezone: "America/Los_Angeles" };
    expect(nextReminderAt(new Date("2026-03-07T18:00:00Z"), la)).toEqual(new Date("2026-03-08T04:00:00Z"));
    // DST starts on 8 March 2026.
    expect(nextReminderAt(new Date("2026-03-08T18:00:00Z"), la)).toEqual(new Date("2026-03-09T03:00:00Z"));
  });
});
