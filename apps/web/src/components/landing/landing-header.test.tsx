// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingHeader } from "./landing-header";

let authState: { status: string } = { status: "signedOut" };
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ state: authState }) }));

beforeEach(() => {
  authState = { status: "signedOut" };
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(cleanup);

const header = () => screen.getByRole("banner");

describe("LandingHeader", () => {
  it("has a named nav, a skip link, Features, the theme button and Get started", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
    expect(screen.getByRole("link", { name: "Features" }).getAttribute("href")).toBe("#features");
    expect(screen.getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeTruthy();
  });

  it("has no Log in on the navbar, signed out or in", () => {
    const { unmount } = render(<LandingHeader />);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    unmount();

    authState = { status: "signedIn" };
    render(<LandingHeader />);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("deepens the capsule's shadow after a small scroll", () => {
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

  it("scrolls smoothly only while the page is on screen", () => {
    const { unmount } = render(<LandingHeader />);
    expect(document.documentElement.classList.contains("l-smooth")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("l-smooth")).toBe(false);
  });

  it("offers someone signed in a way into the app instead of Get started", () => {
    authState = { status: "signedIn" };
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Open Streaks" }).getAttribute("href")).toBe("/today");
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });
});
