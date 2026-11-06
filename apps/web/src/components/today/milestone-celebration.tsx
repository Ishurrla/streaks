"use client";

import { daysOn, isEveryDay, MILESTONE_NAMES, nextMilestone } from "@streaks/core/schedule";
import { useRouter } from "next/navigation";
import { Flame } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import type { Habit } from "@/lib/data";

/** A milestone a check-in just earned, as the server reported it in milestoneReached. */
export interface MilestoneHit {
  habit: Habit;
  milestone: number;
}

/**
 * The milestone card: the all-done celebration's style with a medal. It opens only for a
 * milestoneReached from the server. The native dialog traps focus, closes on Escape and
 * hands focus back to the card that was checked; confetti skips reduced motion.
 */
export function MilestoneCelebration({ hit, today, onClose }: { hit: MilestoneHit | null; today: string; onClose: () => void }) {
  const router = useRouter();
  const n = hit?.milestone ?? 0;
  const next = nextMilestone(n);
  const unit = hit && isEveryDay(daysOn(hit.habit, today)) ? "days" : "in a row";

  return (
    <Sheet open={hit !== null} onClose={onClose} labelledBy="milestone-title" className="celeb">
      {hit && (
        <>
          <div className="bigmedal" aria-hidden="true">
            {n}
            <Flame live />
          </div>
          <h2 id="milestone-title">{MILESTONE_NAMES[n]}!</h2>
          <p className="text-muted wrap-anywhere">
            {hit.habit.name}: {n} {unit}.{" "}
            {next ? `Next stop: ${MILESTONE_NAMES[next]} at ${next}.` : "That is every milestone."}
          </p>
          <div className="mt-5.5 flex flex-col gap-2.5">
            {/* The dialog focuses its first button on opening, so no autoFocus. */}
            <button className="btn btn-block" type="button" onClick={onClose}>
              Keep going
            </button>
            <button
              className="btn btn-ghost btn-block"
              type="button"
              onClick={() => {
                onClose();
                router.push(`/progress?habit=${encodeURIComponent(hit.habit.id)}&badge=${n}`);
              }}
            >
              See my badges
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
