import type { Theme } from "./types";

export const THEME_STORAGE_KEY = "streaks-theme";

/** What the page shows. Settings can also say "system", which means "follow the device". */
export type ThemeMode = "light" | "dark";

const CHANGE_EVENT = "streaks-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs inline in <head> before first paint, so a remembered light or dark choice never
 * flashes the other theme. With no choice stored, nothing is set and the CSS follows the
 * device. The signed-in source of truth is the profile's `theme`; localStorage remembers
 * the last choice for the public pages and between visits.
 */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** The theme to show: the stored choice if there is one, else the device's. */
export function resolveTheme(stored: string | null | undefined, deviceDark: boolean): ThemeMode {
  if (stored === "light" || stored === "dark") return stored;
  return deviceDark ? "dark" : "light";
}

function storedChoice(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function deviceIsDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/** The theme currently showing in this browser. */
export function currentTheme(): ThemeMode {
  return resolveTheme(storedChoice(), deviceIsDark());
}

/** Calls `onChange` when the theme may have changed: a choice here or in another tab, or the device's. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  media?.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media?.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function remember(value: ThemeMode | null) {
  try {
    if (value) localStorage.setItem(THEME_STORAGE_KEY, value);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/**
 * Applies a theme to <html> and remembers it. "system" forgets any stored choice, so the
 * device theme applies here and on the public pages.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.dataset.theme = theme;
    remember(theme);
  } else {
    delete root.dataset.theme;
    remember(null);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
