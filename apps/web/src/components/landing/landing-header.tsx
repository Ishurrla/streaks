"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ArrowRightIcon, Flame } from "@/components/icons";
import { ThemeButton } from "@/components/theme-switch";
import { useAuth } from "@/lib/auth";

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** True once the page has moved a little, which deepens the capsule's shadow. */
function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 6,
    () => false,
  );
}

/**
 * The landing page's navbar: a floating capsule with the logo, "Features", a round theme button
 * and one "Get started". People log in from the Sign up / Log in switch on the screen that opens.
 * The header around the capsule lets clicks through to the page beneath it.
 */
export function LandingHeader() {
  const { state } = useAuth();
  const scrolled = useScrolled();

  // Smooth anchor scrolling, for this page only. An effect rather than a CSS :has() rule: Next
  // keeps a page mounted but hidden after leaving it, which would still match, but it does
  // clean up effects.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("l-smooth");
    return () => root.classList.remove("l-smooth");
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={`l-head ${scrolled ? "scrolled" : ""}`}>
        <nav className="l-pill" aria-label="Main">
          <a className="l-logo" href="#top" aria-label="Streaks home">
            <span className="l-chip">
              <Flame />
            </span>
            <span className="l-word">Streaks</span>
          </a>
          <a className="l-link" href="#features">
            Features
          </a>
          <ThemeButton />
          {state.status === "signedIn" ? (
            <Link className="l-cta" href="/today">
              Open Streaks
              <ArrowRightIcon />
            </Link>
          ) : (
            <Link className="l-cta" href="/signup">
              Get started
              <ArrowRightIcon />
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
