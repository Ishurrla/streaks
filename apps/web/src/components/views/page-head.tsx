import type { ReactNode } from "react";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-[28px] font-extrabold">{title}</h1>
      {children}
    </div>
  );
}
