// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeButton, ThemeSwitch } from "./theme-switch";

/** jsdom has no matchMedia; this one reports the given device theme. */
function deviceTheme(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  deviceTheme(false);
});

afterEach(cleanup);

const theSwitch = () => screen.getByRole("switch", { name: "Dark mode" });

describe.each([
  ["ThemeSwitch", ThemeSwitch],
  ["ThemeButton", ThemeButton],
])("%s", (_name, Control) => {
  it("starts from the device theme when nothing is stored", () => {
    deviceTheme(true);
    render(<Control />);
    expect(theSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("starts from a stored choice over the device theme", () => {
    deviceTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<Control />);
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("flips aria-checked, sets the document theme and remembers the choice", () => {
    render(<Control />);
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");

    fireEvent.click(theSwitch());
    expect(theSwitch().getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(theSwitch());
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("works from the keyboard as a native button", () => {
    render(<Control />);
    const button = theSwitch();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("follows Settings: a saved theme wins, and Device forgets the choice", () => {
    deviceTheme(true);
    render(<Control />);

    act(() => applyTheme("light"));
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    act(() => applyTheme("system"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(theSwitch().getAttribute("aria-checked")).toBe("true");
  });
});
