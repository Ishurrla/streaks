"use client";

import { greeting, localToday, longDate } from "@/lib/dates";
import { useProfile } from "@/lib/profile";
import { ComingSoon } from "./page-head";

export function TodayView() {
  const profile = useProfile();
  const today = localToday(profile.timezone);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-[1.1] font-extrabold desk:text-4xl">
            {greeting(profile.timezone)}, {profile.name}
          </h1>
          <p className="mt-1.5 text-muted">{longDate(today)}.</p>
        </div>
        <div
          className="grid size-[42px] flex-none place-items-center rounded-full bg-accent font-display font-extrabold text-accent-ink"
          aria-hidden="true"
        >
          {profile.name.charAt(0).toUpperCase()}
        </div>
      </div>
      <ComingSoon title="Your habits go here" body="The Today screen arrives in phase 5." />
    </>
  );
}
