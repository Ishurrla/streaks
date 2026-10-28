"use client";

import { useState } from "react";
import { CheckIcon, Flame } from "@/components/icons";
import { burst } from "@/lib/fx";

const DEMO = [
  { name: "Read for 20 minutes", streak: 13, color: "#3B6FD8" },
  { name: "Go for a walk", streak: 4, color: "#13795B" },
  { name: "Drink 2 litres of water", streak: 8, color: "#D17F00" },
];

/** The "Try it. Tap a habit." card. Local state only; nothing is saved. */
export function LandingDemo() {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [popped, setPopped] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      {DEMO.map((h, i) => {
        const on = !!done[i];
        return (
          <button
            key={h.name}
            type="button"
            aria-pressed={on}
            style={{ "--hc": h.color } as React.CSSProperties}
            className={`habit-card shadow-none! ${on ? "done" : "bg-canvas!"} ${popped === i && on ? "pop" : ""}`}
            onClick={(e) => {
              setDone((d) => ({ ...d, [i]: !on }));
              if (!on) {
                setPopped(i);
                const r = e.currentTarget.getBoundingClientRect();
                burst(r.left + 36, r.top + r.height / 2, h.color);
              }
            }}
          >
            <span className="check">
              <CheckIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="name">{h.name}</span>
              <span className={`streak-line ${on ? "hot" : "risk"}`}>
                <Flame />
                {on ? `${h.streak + 1} day streak` : `Keep your ${h.streak} day streak`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
