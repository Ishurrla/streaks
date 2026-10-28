import type { ReactNode } from "react";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-[28px] font-extrabold">{title}</h1>
      {children}
    </div>
  );
}

/** Temporary body for screens built in phase 5. */
export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] bg-surface px-4 py-3.5 shadow-card">
      <div className="font-bold">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
