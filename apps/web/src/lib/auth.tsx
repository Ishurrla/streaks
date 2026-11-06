"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  getAdditionalUserInfo,
  GithubAuthProvider,
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
import {
  canDisconnect,
  existingMethod,
  GITHUB_PROVIDER,
  NO_EMAIL_CODE,
  PROVIDER_NAME,
  reauthProvider,
  welcomeName,
  type ExistingMethod,
  type PopupProvider,
} from "./sign-in";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; explicit: boolean }
  | { status: "signedIn"; user: User };

export interface ProviderSignIn {
  /** First time here: goes to the empty first-run Today. */
  isNew: boolean;
  /** First name for the welcome screen. */
  name: string;
}
/** @deprecated The same thing for either provider; kept for existing imports. */
export type GoogleSignIn = ProviderSignIn;

interface AuthApi {
  state: AuthState;
  signUp(name: string, email: string, password: string): Promise<void>;
  logIn(email: string, password: string): Promise<void>;
  /** Signs up or in with Google or GitHub, in a popup. */
  signInWith(provider: PopupProvider): Promise<ProviderSignIn>;
  connect(provider: PopupProvider): Promise<void>;
  disconnect(provider: PopupProvider): Promise<void>;
  /**
   * Confirms it is them with Google or GitHub, then adds a password to an account that has
   * none.
   */
  setPassword(password: string): Promise<void>;
  logOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /**
   * Confirms it is them, with the password or (given null, for an account without one) the
   * Google or GitHub window, then deletes the account and everything in it.
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

function popupProvider(id: PopupProvider) {
  if (id === GITHUB_PROVIDER) {
    const provider = new GithubAuthProvider();
    // Without this GitHub keeps a private email to itself, and an account needs one.
    provider.addScope("user:email");
    return provider;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/** The window that confirms it is them, for an account without a password. */
function reauthPopup(user: User) {
  const id = reauthProvider(user.providerData.map((p) => p.providerId));
  if (!id) throw new Error("This account signs in with a password");
  return popupProvider(id);
}

/**
 * After auth/account-exists-with-different-credential: how the existing account signs in,
 * if Firebase will say (with email enumeration protection on, it will not).
 */
export async function existingMethodFor(err: unknown, trying: PopupProvider): Promise<ExistingMethod> {
  const email = err instanceof FirebaseError ? (err.customData?.email as string | undefined) : undefined;
  if (!email) return null;
  const methods = await fetchSignInMethodsForEmail(auth, email).catch(() => [] as string[]);
  return existingMethod(methods, trying);
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
          // Never for an account with no email: a GitHub sign-in without one is undone at
          // once (see signInWith), and must not leave a profile behind.
          if (user.email) ensureProfile(user.uid).catch(() => undefined);
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
      async signInWith(provider) {
        profileCreatedFor = null;
        const result = await signInWithPopup(auth, popupProvider(provider));
        const { user } = result;
        if (!user.email) {
          // GitHub can sign someone in without sharing an email. Never keep such an account:
          // delete it if it was just made, otherwise sign out.
          if (getAdditionalUserInfo(result)?.isNewUser) await user.delete().catch(() => undefined);
          if (auth.currentUser) await signOut(auth);
          throw new FirebaseError(NO_EMAIL_CODE, `${PROVIDER_NAME[provider]} did not share an email`);
        }
        // If this fails the app shell shows a retry; the account itself exists.
        await ensureProfile(user.uid).catch(() => undefined);
        const isNew = !!getAdditionalUserInfo(result)?.isNewUser || profileCreatedFor === user.uid;
        const profile = await getDoc(doc(db, "users", user.uid)).catch(() => null);
        return { isNew, name: welcomeName((profile?.get("name") as string | undefined) ?? user.displayName, user.email) };
      },
      async connect(provider) {
        await linkWithPopup(currentUser(), popupProvider(provider));
      },
      async disconnect(provider) {
        const user = currentUser();
        if (!canDisconnect(user.providerData.map((p) => p.providerId), provider)) {
          throw new Error(`${PROVIDER_NAME[provider]} is the only way into this account`);
        }
        await unlink(user, provider);
      },
      async setPassword(password) {
        const user = currentUser();
        await reauthenticateWithPopup(user, reauthPopup(user));
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
          await reauthenticateWithPopup(user, reauthPopup(user));
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
