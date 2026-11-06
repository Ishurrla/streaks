"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AuthNote } from "@/lib/sign-in";

const WELCOME_MS = 2200; // How long the bar in .welcome-bar takes to fill.
const WELCOME_REDUCED_MOTION_MS = 800;

/** Google's standard "G". Its colours and proportions must not change. */
export function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 16.03-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.3 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** GitHub's mark (Octicons "mark-github", MIT). Single colour, so it follows the text colour. */
export function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** A Google or GitHub button: the same size and busy state, so the two sit together. */
function ProviderButton({
  logo,
  className,
  label,
  busy,
  disabled,
  onClick,
}: {
  logo: React.ReactNode;
  className: string;
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={className} type="button" disabled={busy || disabled} aria-busy={busy} onClick={onClick}>
      {logo}
      {busy ? (
        <>
          {/* No space needed: the button's flex gap separates the text and the spinner. */}
          {"Signing you in…"}
          <span className="spinner" aria-hidden="true" />
        </>
      ) : (
        label
      )}
    </button>
  );
}

type ButtonProps = { label: string; busy: boolean; disabled?: boolean; onClick: () => void };

export function GoogleButton(props: ButtonProps) {
  return <ProviderButton logo={<GoogleLogo />} className="google-btn" {...props} />;
}

export function GitHubButton(props: ButtonProps) {
  return <ProviderButton logo={<GitHubMark />} className="provider-btn" {...props} />;
}

export function Note({ note, onAction }: { note: AuthNote; onAction?: (does: NonNullable<AuthNote["action"]>["does"]) => void }) {
  // Phrasing content only (a <span>, not a <div>), so it is valid inside <output> too.
  const content = (
    <>
      <b>{note.title}</b>
      {note.body}
      {note.action && (
        <span className="block">
          <button className="note-action" type="button" onClick={() => onAction?.(note.action!.does)}>
            {note.action.label}
          </button>
        </span>
      )}
    </>
  );
  // Errors interrupt (role="alert", which has no HTML element); anything else is announced
  // politely by <output>, the native element for role="status".
  return note.kind === "error" ? (
    <div className="note note-error" role="alert">
      {content}
    </div>
  ) : (
    <output className={`note note-${note.kind} block`}>{content}</output>
  );
}

/**
 * The tick after signing in with Google or GitHub. Moves on by itself, sooner if motion is
 * reduced. It replaces the form, taking away the button that had focus, so focus moves to its
 * heading: screen readers then read "Welcome, …", and keyboard focus is not lost.
 */
export function WelcomeTick({ isNew, name, to }: { isNew: boolean; name: string; to: string }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => router.replace(to), reduced ? WELCOME_REDUCED_MOTION_MS : WELCOME_MS);
    return () => clearTimeout(timer);
  }, [router, to]);

  return (
    <div className="welcome mt-7">
      <div className="welcome-ring">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      {/* Focusable from code only (tabIndex -1), so no focus ring and not in the Tab order. */}
      <h1 ref={heading} tabIndex={-1} className="mb-1.5 text-[26px] font-extrabold outline-none">{isNew ? `Welcome, ${name}` : `Welcome back, ${name}`}</h1>
      <p className="text-muted">{isNew ? "Your account is ready. Taking you to set up your first habit." : "Taking you to Today."}</p>
      <div className="welcome-bar" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}
