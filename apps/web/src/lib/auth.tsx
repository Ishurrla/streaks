"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { auth, functions } from "./firebase";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; explicit: boolean }
  | { status: "signedIn"; user: User };

interface AuthApi {
  state: AuthState;
  signUp(name: string, email: string, password: string): Promise<void>;
  logIn(email: string, password: string): Promise<void>;
  logOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

// The name typed on the sign-up form, used when the profile is first created.
let pendingName: string | null = null;
let inflight: { uid: string; promise: Promise<unknown> } | null = null;

/**
 * Calls the ensureProfile function. It is safe to call often (the server makes it a
 * no-op once the profile exists), and concurrent calls for the same user share one
 * request, so the sign-up name cannot be lost to a racing call without it.
 */
export function ensureProfile(uid: string): Promise<unknown> {
  if (inflight?.uid === uid) return inflight.promise;
  const call = httpsCallable(functions, "ensureProfile");
  const promise = call({ name: pendingName ?? undefined, timezone: browserTimezone() }).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { uid, promise };
  return promise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const explicitSignOut = useRef(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) {
          explicitSignOut.current = false;
          setState({ status: "signedIn", user });
        } else {
          setState({ status: "signedOut", explicit: explicitSignOut.current });
        }
      }),
    [],
  );

  const api = useMemo<AuthApi>(
    () => ({
      state,
      async signUp(name, email, password) {
        pendingName = name.trim();
        try {
          const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
          // If this fails the app shell shows a retry; the account itself exists.
          await ensureProfile(user.uid).catch(() => undefined);
        } finally {
          pendingName = null;
        }
      },
      async logIn(email, password) {
        const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
        await ensureProfile(user.uid).catch(() => undefined);
      },
      async logOut() {
        explicitSignOut.current = true;
        await signOut(auth);
        queryClient.clear();
      },
      sendPasswordReset(email) {
        return sendPasswordResetEmail(auth, email.trim());
      },
    }),
    [state, queryClient],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
