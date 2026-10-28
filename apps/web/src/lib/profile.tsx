"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { ensureProfile } from "./auth";
import { db } from "./firebase";
import { useLive } from "./live";
import { applyTheme } from "./theme";
import type { Profile } from "./types";

export interface ProfileWithId extends Profile {
  uid: string;
}

const ProfileContext = createContext<ProfileWithId | null>(null);

/**
 * Live view of users/{uid}. If the document does not exist yet (first sign-in, or a
 * sign-up whose ensureProfile call failed) it calls ensureProfile and keeps waiting.
 */
export function useProfileDoc(uid: string) {
  const ensured = useRef(false);
  return useLive<ProfileWithId>(["profile", uid], (next, fail) =>
    onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (snap.exists()) {
          next({ uid, ...(snap.data() as Profile) });
        } else if (!ensured.current) {
          ensured.current = true;
          ensureProfile(uid).catch((e: Error) => {
            ensured.current = false;
            fail(e);
          });
        }
      },
      fail,
    ),
  );
}

export function ProfileProvider({ profile, children }: { profile: ProfileWithId; children: ReactNode }) {
  useEffect(() => applyTheme(profile.theme), [profile.theme]);
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

/** The signed-in user's profile. Only available inside the protected app layout. */
export function useProfile(): ProfileWithId {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("useProfile must be used inside the app layout");
  return profile;
}
