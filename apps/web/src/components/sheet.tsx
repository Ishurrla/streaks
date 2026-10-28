"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal sheet on the native <dialog>, which brings a focus trap, Esc to close and focus
 * returning to the opener. Bottom sheet on mobile, centred card from 900px.
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`sheet ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && <div className="sheet-body">{children}</div>}
    </dialog>
  );
}
