"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addPassword } from "./add-password";
import { callApi } from "./api";
import { auth, db } from "./firebase";
import { disablePushOnThisDevice } from "./push";
import { canDisconnect, GOOGLE_PROVIDER, welcomeName } from "./sign-in";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; explicit: boolean }
  | { status: "signedIn"; user: User };

export interface GoogleSignIn {
  /** First time here: goes to the empty first-run Today. */
  isNew: boolean;
  /** First name for the welcome screen. */
  name: string;
}

interface AuthApi {
  state: AuthState;
  signUp(name: string, email: string, password: string): Promise<void>;
  logIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<GoogleSignIn>;
  connectGoogle(): Promise<void>;
  disconnectGoogle(): Promise<void>;
  /** Confirms it is them with Google, then adds a password to a Google-only account. */
  setPassword(password: string): Promise<void>;
  logOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /**
   * Confirms it is them, with the password or (given null, for a Google-only account) the
   * Google window, then deletes the account and everything in it.
   */
  deleteAccount(password: string | null): Promise<void>;
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
// Set while an account is being deleted, so the profile listener does not "repair" the
// profile it sees disappear. The server refuses that too; this just avoids the call.
let deletingAccount = false;
// Whose profile the last ensureProfile call created. The auth listener usually makes that
// call first, so a Google sign-in cannot learn it from its own (later) call.
let profileCreatedFor: string | null = null;

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function currentUser(): User {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return user;
}

/**
 * Calls the ensureProfile function. It is safe to call often (the server makes it a
 * no-op once the profile exists), and concurrent calls for the same user share one
 * request, so the sign-up name cannot be lost to a racing call without it.
 */
export function ensureProfile(uid: string): Promise<unknown> {
  if (deletingAccount) return Promise.resolve();
  if (inflight?.uid === uid) return inflight.promise;
  const promise = callApi<{ created: boolean }>("ensure-profile", { name: pendingName ?? undefined, timezone: browserTimezone() })
    .then((result) => {
      if (result.created) profileCreatedFor = uid;
      return result;
    })
    .finally(() => {
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
          // On every app start: creates the profile if needed, and otherwise lets the server
          // catch up (close a day the cron has not closed yet, refresh the reminder schedule).
          ensureProfile(user.uid).catch(() => undefined);
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
      async signInWithGoogle() {
        profileCreatedFor = null;
        const result = await signInWithPopup(auth, googleProvider());
        const { user } = result;
        // If this fails the app shell shows a retry; the account itself exists.
        await ensureProfile(user.uid).catch(() => undefined);
        const isNew = !!getAdditionalUserInfo(result)?.isNewUser || profileCreatedFor === user.uid;
        const profile = await getDoc(doc(db, "users", user.uid)).catch(() => null);
        return { isNew, name: welcomeName((profile?.get("name") as string | undefined) ?? user.displayName, user.email) };
      },
      async connectGoogle() {
        await linkWithPopup(currentUser(), googleProvider());
      },
      async disconnectGoogle() {
        const user = currentUser();
        if (!canDisconnect(user.providerData.map((p) => p.providerId), GOOGLE_PROVIDER)) {
          throw new Error("Google is the only way into this account");
        }
        await unlink(user, GOOGLE_PROVIDER);
      },
      async setPassword(password) {
        const user = currentUser();
        await reauthenticateWithPopup(user, googleProvider());
        await addPassword(user, password);
      },
      async logOut() {
        // Stop reminders reaching this device for whoever signs in next. Needs auth, so first.
        await disablePushOnThisDevice();
        explicitSignOut.current = true;
        await signOut(auth);
        queryClient.clear();
      },
      sendPasswordReset(email) {
        return sendPasswordResetEmail(auth, email.trim());
      },
      async deleteAccount(password) {
        const user = currentUser();
        // The server only deletes after a recent sign-in, so confirm it is them and
        // force a fresh ID token carrying the new sign-in time.
        if (password === null) {
          await reauthenticateWithPopup(user, googleProvider());
        } else {
          if (!user.email) throw new Error("Not signed in");
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        }
        await user.getIdToken(true);
        await disablePushOnThisDevice();
        deletingAccount = true;
        try {
          await callApi("delete-account");
          explicitSignOut.current = true;
          await signOut(auth);
          queryClient.clear();
        } finally {
          deletingAccount = false;
        }
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
