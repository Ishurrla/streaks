"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, MoonStarIcon, SunIcon } from "@/components/icons";
import { applyTheme, currentTheme, subscribeTheme } from "@/lib/theme";

/** Whether dark mode is showing, in step with Settings and every other theme control. */
function useDarkMode() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const dark = theme === "dark";
  return { dark, toggle: () => applyTheme(dark ? "light" : "dark") };
}

/**
 * The sun and moon switch on the sign-in screen: light or dark, remembered in this browser.
 * The knob's position comes from the theme on <html> in CSS, so it is right on first paint;
 * aria-checked follows once the page is interactive.
 */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { dark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className={`theme-switch ${className}`}
      onClick={toggle}
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

/**
 * The same switch as a 44px round icon, for the landing page's navbar. Which icon shows also
 * comes from the theme on <html> in CSS, so it too is right on first paint.
 */
export function ThemeButton({ className = "" }: { className?: string }) {
  const { dark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className={`theme-btn ${className}`}
      onClick={toggle}
    >
      <SunIcon className="tb-sun" />
      <MoonIcon className="tb-moon" />
    </button>
  );
}
