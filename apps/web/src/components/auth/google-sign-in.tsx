"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

export function GoogleButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="google-btn" type="button" disabled={busy || disabled} aria-busy={busy} onClick={onClick}>
      <GoogleLogo />
      {busy ? (
        <>
          Signing you in…
          <span className="spinner" aria-hidden="true" />
        </>
      ) : (
        label
      )}
    </button>
  );
}

export function Note({ note, onAction }: { note: AuthNote; onAction?: (does: NonNullable<AuthNote["action"]>["does"]) => void }) {
  return (
    <div className={`note note-${note.kind}`} role={note.kind === "error" ? "alert" : "status"}>
      <b>{note.title}</b>
      {note.body}
      {note.action && (
        <div>
          <button className="note-action" type="button" onClick={() => onAction?.(note.action!.does)}>
            {note.action.label}
          </button>
        </div>
      )}
    </div>
  );
}

/** The tick after signing in with Google. Moves on by itself, sooner if motion is reduced. */
export function WelcomeTick({ isNew, name, to }: { isNew: boolean; name: string; to: string }) {
  const router = useRouter();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => router.replace(to), reduced ? WELCOME_REDUCED_MOTION_MS : WELCOME_MS);
    return () => clearTimeout(timer);
  }, [router, to]);

  return (
    <div className="welcome mt-7" role="status">
      <div className="welcome-ring">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </div>
      <h1 className="mb-1.5 text-[26px] font-extrabold">{isNew ? `Welcome, ${name}` : `Welcome back, ${name}`}</h1>
      <p className="text-muted">{isNew ? "Your account is ready. Taking you to set up your first habit." : "Taking you to Today."}</p>
      <div className="welcome-bar" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}
