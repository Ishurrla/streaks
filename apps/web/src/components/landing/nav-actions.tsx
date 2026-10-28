"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Log in / Get started, or a shortcut into the app for someone already signed in. */
export function LandingNavActions() {
  const { state } = useAuth();

  if (state.status === "signedIn") {
    return (
      <Link className="btn px-4! py-[9px]!" href="/today">
        Open Streaks
      </Link>
    );
  }

  return (
    <>
      <Link className="btn btn-ghost px-4! py-[9px]!" href="/login">
        Log in
      </Link>
      <Link className="btn px-4! py-[9px]!" href="/signup">
        Get started
      </Link>
    </>
  );
}
