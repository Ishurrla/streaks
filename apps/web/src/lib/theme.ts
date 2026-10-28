import type { Theme } from "./types";

const STORAGE_KEY = "streaks-theme";

/**
 * Runs inline in <head> before first paint, so a saved light/dark choice never flashes
 * the other theme. The source of truth is the profile's `theme`; localStorage only
 * remembers it between visits (and for the public pages).
 */
export const themeScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** Applies a theme to <html> and remembers it. "system" follows the device. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}
