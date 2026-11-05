// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HERO_CTA_ID } from "./hero-cta-id";
import { LandingHeader } from "./landing-header";

let authState: { status: string } = { status: "signedOut" };
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ state: authState }) }));

type Entry = { isIntersecting: boolean; boundingClientRect: { top: number } };
let report: (entry: Entry) => void;

beforeEach(() => {
  authState = { status: "signedOut" };
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: Entry[]) => void) {
        report = (entry) => callback([entry]);
      }
      observe() {}
      disconnect() {}
    },
  );
  const hero = document.createElement("a");
  hero.id = HERO_CTA_ID;
  document.body.appendChild(hero);
});

afterEach(() => {
  cleanup();
  document.getElementById(HERO_CTA_ID)?.remove();
  vi.unstubAllGlobals();
});

const header = () => screen.getByRole("banner");

describe("LandingHeader", () => {
  it("keeps the routes and has a named nav and a skip link to the main content", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeTruthy();
  });

  it("offers Get started only after the hero button has scrolled up behind the bar", () => {
    render(<LandingHeader />);
    expect(header().className).not.toContain("show-cta");

    act(() => report({ isIntersecting: false, boundingClientRect: { top: -40 } }));
    expect(header().className).toContain("show-cta");

    act(() => report({ isIntersecting: true, boundingClientRect: { top: 200 } }));
    expect(header().className).not.toContain("show-cta");
  });

  it("does not count a hero button that is still below the fold", () => {
    render(<LandingHeader />);
    act(() => report({ isIntersecting: false, boundingClientRect: { top: 900 } }));
    expect(header().className).not.toContain("show-cta");
  });

  it("gets its surface after a small scroll", () => {
    render(<LandingHeader />);
    expect(header().className).not.toContain("scrolled");
    act(() => {
      window.scrollY = 40;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header().className).toContain("scrolled");
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header().className).not.toContain("scrolled");
  });

  it("shows someone signed in a way into the app, always, and no Log in", () => {
    authState = { status: "signedIn" };
    render(<LandingHeader />);
    const open = screen.getByRole("link", { name: "Open Streaks" });
    expect(open.getAttribute("href")).toBe("/today");
    expect(open.className).not.toContain("later");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();

    act(() => report({ isIntersecting: false, boundingClientRect: { top: -40 } }));
    expect(header().className).not.toContain("show-cta");
  });
});
