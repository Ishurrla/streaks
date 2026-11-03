"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/**
 * A password input with an eye button that shows or hides what was typed. Hidden by
 * default, and hidden again whenever `resetKey` changes (the form bumps it after a
 * failed attempt). Switching keeps the value, focus and cursor position.
 */
export function PasswordInput({
  resetKey,
  className = "",
  ...input
}: { resetKey?: unknown } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (resetKey !== seenKey) {
    setSeenKey(resetKey);
    setShown(false);
  }

  const ref = useRef<HTMLInputElement>(null);
  const selection = useRef<[number | null, number | null] | null>(null);

  // Some browsers move the cursor when an input's type changes; put it back.
  useLayoutEffect(() => {
    const el = ref.current;
    const range = selection.current;
    selection.current = null;
    if (el && range && document.activeElement === el) el.setSelectionRange(range[0], range[1]);
  }, [shown]);

  function toggle() {
    const el = ref.current;
    if (el) selection.current = [el.selectionStart, el.selectionEnd];
    setShown((s) => !s);
  }

  return (
    <div className="password-field">
      <input ref={ref} {...input} type={shown ? "text" : "password"} className={`input ${className}`} />
      <button
        type="button"
        className="password-toggle"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={input.id}
        // Keep focus (and the cursor) in the input when it is clicked or tapped.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
