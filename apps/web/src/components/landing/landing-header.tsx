"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRightIcon, Flame } from "@/components/icons";
import { ThemeButton } from "@/components/theme-switch";
import { useAuth } from "@/lib/auth";
import { HERO_CTA_ID } from "./hero-cta-id";

// Keep in step with .l-nav's height on phones: the hero button is gone once it is behind the bar.
const BAR_HEIGHT = 64;

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** True once the page has moved a little, which gives the bar its surface. */
function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 6,
    () => false,
  );
}

/** True once the hero button has scrolled up behind the bar. Below the fold does not count. */
function useHeroScrolledAway() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const hero = document.getElementById(HERO_CTA_ID);
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAway(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < BAR_HEIGHT),
      { rootMargin: `-${BAR_HEIGHT}px 0px 0px 0px` },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  return away;
}

/**
 * The landing page's navbar: logo, round theme button, "Log in" and one filled "Get started".
 * On phones "Get started" stays out of the bar while the hero's own button is on screen; CSS
 * does the hiding (from 640px everything always shows), with visibility so it cannot be focused.
 */
export function LandingHeader() {
  const { state } = useAuth();
  const scrolled = useScrolled();
  const heroAway = useHeroScrolledAway();
  const signedIn = state.status === "signedIn";

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={`l-head ${scrolled ? "scrolled" : ""} ${heroAway && !signedIn ? "show-cta" : ""}`}>
        <nav className="l-nav" aria-label="Main">
          <a className="l-logo" href="#top" aria-label="Streaks home">
            <Flame />
            <span className="l-logo-word">Streaks</span>
          </a>
          <div className="l-actions">
            <ThemeButton />
            {signedIn ? (
              <Link className="l-cta" href="/today">
                Open Streaks
                <ArrowRightIcon />
              </Link>
            ) : (
              <>
                <Link className="l-login" href="/login">
                  Log in
                </Link>
                <Link className="l-cta later" href="/signup">
                  Get started
                  <ArrowRightIcon />
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
    </>
  );
}
