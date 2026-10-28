"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Flame } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { ProfileProvider, useProfileDoc } from "@/lib/profile";

function Splash({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Flame live className="size-12!" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

/**
 * Client-side route protection for everything under app/(app). There is no server
 * session: the guard waits for Firebase Auth, sends signed-out visitors to log in
 * (remembering where they were going), then waits for the profile document.
 */
export function AppGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status !== "signedOut") return;
    router.replace(state.explicit ? "/" : `/login?next=${encodeURIComponent(pathname)}`);
  }, [state, pathname, router]);

  if (state.status !== "signedIn") return <Splash label="Loading…" />;
  return (
    <ProfileGate key={state.user.uid} uid={state.user.uid}>
      {children}
    </ProfileGate>
  );
}

function ProfileGate({ uid, children }: { uid: string; children: ReactNode }) {
  const { data, error, retry } = useProfileDoc(uid);
  const { logOut } = useAuth();

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <div className="max-w-sm rounded-[22px] bg-surface p-6 text-center shadow-card" role="alert">
          <h1 className="mb-2 text-2xl font-extrabold">We could not load your account</h1>
          <p className="mb-5 text-muted">Check your connection and try again.</p>
          <div className="flex gap-2.5">
            <button className="btn btn-ghost flex-1" type="button" onClick={() => logOut()}>
              Log out
            </button>
            <button className="btn flex-1" type="button" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!data) return <Splash label="Getting your habits ready…" />;
  return <ProfileProvider profile={data}>{children}</ProfileProvider>;
}
