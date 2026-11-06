"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * How long after a sheet closes that page clicks are swallowed: long enough for the second
 * half of a double-click or double-tap, too short for a deliberate next click.
 */
const CLICK_SHIELD_MS = 300;

const subscribeNothing = () => () => {};

let locks = 0;
let saved = { overflow: "", paddingRight: "" };

/**
 * Makes everything but `dialog` inert and stops the page scrolling. The confetti layer (#fx)
 * stays as it is: it never takes pointer events. Returns the undo.
 */
function lockPage(dialog: HTMLDialogElement): () => void {
  const made = [...document.body.children].filter(
    (el) => el !== dialog && !el.contains(dialog) && el.id !== "fx" && el.tagName !== "SCRIPT" && !el.hasAttribute("inert"),
  );
  made.forEach((el) => el.setAttribute("inert", ""));

  const html = document.documentElement;
  if (locks++ === 0) {
    saved = { overflow: html.style.overflow, paddingRight: document.body.style.paddingRight };
    // Keep the layout still when the scrollbar disappears.
    const scrollbar = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }

  return () => {
    made.forEach((el) => el.removeAttribute("inert"));
    if (--locks === 0) {
      html.style.overflow = saved.overflow;
      document.body.style.paddingRight = saved.paddingRight;
    }
  };
}

const swallow = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
};
let shieldTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Swallows page clicks for a moment, so a second click or tap after closing hits nothing.
 * html[data-click-shield] is set meanwhile, which tests wait on.
 */
function shieldClicks() {
  const html = document.documentElement;
  window.addEventListener("click", swallow, true);
  html.dataset.clickShield = ""
  clearTimeout(shieldTimer);
  shieldTimer = setTimeout(() => {
    window.removeEventListener("click", swallow, true);
    delete html.dataset.clickShield;
  }, CLICK_SHIELD_MS);
}

/**
 * Modal sheet on the native <dialog>, which brings a backdrop over everything, a focus trap,
 * Esc to close and focus returning to the opener. Bottom sheet on mobile, centred card from 900px.
 *
 * It is rendered straight into <body>, so the rest of the app can be made inert and stop
 * scrolling while it is open. When it closes, the next click is swallowed: without that, the
 * second click of a double-click on the backdrop landed on whatever the sheet had covered.
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The latest onClose, for the backdrop listener below, which lives as long as the sheet is open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // No <body> to render into on the server.
  const inBrowser = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const unlock = lockPage(dialog);
    // A click on the dialog element itself (not its content) is a click on the backdrop.
    // Escape is the keyboard way to the same thing (onCancel below).
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) onCloseRef.current();
    };
    dialog.addEventListener("click", onBackdrop);
    // Also runs when Next hides this page (it keeps it mounted), so nothing stays locked.
    return () => {
      dialog.removeEventListener("click", onBackdrop);
      unlock();
      if (dialog.open) dialog.close();
      shieldClicks();
    };
  }, [open, inBrowser]);

  if (!inBrowser) return null;
  return createPortal(
    // <dialog> is a dialog to assistive technology already; no role attribute needed.
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={`sheet ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && <div className="sheet-body">{children}</div>}
    </dialog>,
    document.body,
  );
}
