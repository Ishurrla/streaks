"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarIcon, Flame, GearIcon, ListIcon, TodayIcon } from "@/components/icons";
import { PushListener } from "./push-listener";

const TABS = [
  { href: "/today", label: "Today", icon: TodayIcon },
  { href: "/habits", label: "Habits", icon: ListIcon },
  { href: "/progress", label: "Progress", icon: CalendarIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

// Habits and Settings use a narrower column on desktop, centred beside the sidebar.
const NARROW = new Set(["/habits", "/settings"]);

/** Bottom tab bar on mobile, left sidebar from 900px. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const narrow = NARROW.has(pathname);

  return (
    <div className="desk:flex desk:min-h-dvh">
      <PushListener />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] desk:px-10 desk:pt-9 desk:pb-12">
        <div className={`mx-auto max-w-140 ${narrow ? "desk:max-w-180" : "desk:max-w-260"}`}>
          {children}
        </div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] desk:sticky desk:top-0 desk:order-first desk:h-dvh desk:w-58 desk:flex-none desk:flex-col desk:gap-1 desk:border-t-0 desk:border-r desk:px-3.5 desk:py-5.5"
      >
        <div className="hidden items-center gap-2 px-2.5 pb-5.5 font-display text-[22px] font-extrabold desk:flex">
          <Flame live />
          Streaks
        </div>
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 pt-2.5 pb-3 text-xs font-medium text-muted aria-[current=page]:text-accent desk:flex-none desk:flex-row desk:gap-3 desk:rounded-[14px] desk:px-3.5 desk:py-3 desk:text-left desk:text-[15px] desk:hover:bg-canvas desk:aria-[current=page]:bg-done-soft"
          >
            <Icon className="size-6" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
