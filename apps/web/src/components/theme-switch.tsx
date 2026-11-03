"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, MoonStarIcon, SunIcon } from "@/components/icons";
import { applyTheme, currentTheme, subscribeTheme } from "@/lib/theme";

/**
 * The sun and moon switch on the public pages: light or dark, remembered in this browser.
 * The knob's position comes from the theme on <html> in CSS, so it is right on first paint;
 * aria-checked follows once the page is interactive.
 */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className={`theme-switch ${className}`}
      onClick={() => applyTheme(dark ? "light" : "dark")}
    >
      <span className="ts-track" aria-hidden="true">
        <SunIcon className="ts-icon ts-sun" />
        <MoonIcon className="ts-icon ts-moon" />
        <span className="ts-knob">
          <SunIcon className="ts-knob-sun" />
          <MoonStarIcon className="ts-knob-moon" />
        </span>
      </span>
    </button>
  );
}
