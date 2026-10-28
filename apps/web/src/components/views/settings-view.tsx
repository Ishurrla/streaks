"use client";

import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import { PageHead } from "./page-head";

export function SettingsView() {
  const { state, logOut } = useAuth();
  const profile = useProfile();
  const email = state.status === "signedIn" ? state.user.email : null;

  return (
    <>
      <PageHead title="Settings" />
      <section className="mb-3.5 rounded-[20px] bg-surface p-[18px] shadow-card" aria-labelledby="account-title">
        <h2 id="account-title" className="mb-0.5 text-lg">
          Account
        </h2>
        <p className="mb-2 text-sm text-muted">
          Signed in as {profile.name}
          {email ? ` (${email})` : ""}.
        </p>
        <div className="mt-1.5 flex flex-col gap-2.5">
          <button className="btn btn-ghost" type="button" onClick={() => logOut()}>
            Log out
          </button>
        </div>
      </section>
    </>
  );
}
