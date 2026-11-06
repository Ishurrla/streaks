// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { FirebaseError } from "firebase/app";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What lib/auth.tsx does with a GitHub sign-in that shares no email. The Auth emulator's
// GitHub window insists on an email, so this case is checked here with the SDK faked.

const fb = vi.hoisted(() => ({
  listener: null as null | ((user: unknown) => void),
  result: null as null | { user: Record<string, unknown>; isNew: boolean },
  currentUser: null as unknown,
}));

vi.mock("firebase/auth", () => {
  class FakeProvider {
    scopes: string[] = [];
    addScope(s: string) {
      this.scopes.push(s);
    }
    setCustomParameters() {}
  }
  return {
    GithubAuthProvider: FakeProvider,
    GoogleAuthProvider: FakeProvider,
    EmailAuthProvider: { credential: vi.fn() },
    onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
      fb.listener = cb;
      return () => {};
    },
    signInWithPopup: vi.fn(async () => {
      fb.currentUser = fb.result!.user;
      fb.listener?.(fb.result!.user);
      return { user: fb.result!.user };
    }),
    getAdditionalUserInfo: () => ({ isNewUser: fb.result!.isNew }),
    signOut: vi.fn(async () => {
      fb.currentUser = null;
      fb.listener?.(null);
    }),
    fetchSignInMethodsForEmail: vi.fn(async () => []),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    linkWithPopup: vi.fn(),
    unlink: vi.fn(),
    reauthenticateWithCredential: vi.fn(),
    reauthenticateWithPopup: vi.fn(),
  };
});
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: vi.fn(async () => null) }));
vi.mock("./firebase", () => ({
  auth: {
    get currentUser() {
      return fb.currentUser;
    },
  },
  db: {},
}));
const callApi = vi.hoisted(() => vi.fn(async () => ({ created: true })));
vi.mock("./api", () => ({ callApi }));
vi.mock("./push", () => ({ disablePushOnThisDevice: vi.fn(async () => undefined) }));

import { signInWithPopup, signOut } from "firebase/auth";
import { AuthProvider, useAuth } from "./auth";
import { GITHUB_PROVIDER, NO_EMAIL_CODE } from "./sign-in";

let api: ReturnType<typeof useAuth>;
function Grab({ onApi }: { onApi: (a: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  useEffect(() => {
    onApi(auth);
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  fb.listener = null;
  fb.currentUser = null;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Grab
          onApi={(a) => {
            api = a;
          }}
        />
      </AuthProvider>
    </QueryClientProvider>,
  );
});

afterEach(cleanup);

const githubUser = (email: string | null) => ({
  uid: "u1",
  email,
  displayName: "Octo Cat",
  providerData: [{ providerId: GITHUB_PROVIDER }],
  delete: vi.fn(async () => {
    fb.currentUser = null;
  }),
});

async function signInExpectingFailure() {
  let error: unknown;
  await act(async () => {
    error = await api.signInWith(GITHUB_PROVIDER).catch((e: unknown) => e);
  });
  return error;
}

describe("GitHub sign-in with no email", () => {
  it("asks GitHub for the email address", async () => {
    fb.result = { user: githubUser("octo@example.com"), isNew: false };
    await act(async () => {
      await api.signInWith(GITHUB_PROVIDER);
    });
    const provider = vi.mocked(signInWithPopup).mock.calls[0]![1] as unknown as { scopes: string[] };
    expect(provider.scopes).toContain("user:email");
  });

  it("deletes a just-created account, makes no profile, and says why", async () => {
    const user = githubUser(null);
    fb.result = { user, isNew: true };
    const error = await signInExpectingFailure();
    expect(error).toBeInstanceOf(FirebaseError);
    expect((error as FirebaseError).code).toBe(NO_EMAIL_CODE);
    expect(user.delete).toHaveBeenCalledOnce();
    expect(fb.currentUser).toBeNull();
    expect(callApi).not.toHaveBeenCalledWith("ensure-profile", expect.anything());
  });

  it("signs out an existing account instead of deleting it", async () => {
    const user = githubUser(null);
    fb.result = { user, isNew: false };
    const error = await signInExpectingFailure();
    expect((error as FirebaseError).code).toBe(NO_EMAIL_CODE);
    expect(user.delete).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(fb.currentUser).toBeNull();
    expect(callApi).not.toHaveBeenCalledWith("ensure-profile", expect.anything());
  });

  it("still signs out if deleting the new account fails, so no one is left signed in", async () => {
    const user = githubUser(null);
    user.delete = vi.fn(async () => {
      throw new Error("network");
    });
    fb.result = { user, isNew: true };
    const error = await signInExpectingFailure();
    expect((error as FirebaseError).code).toBe(NO_EMAIL_CODE);
    expect(signOut).toHaveBeenCalled();
    expect(fb.currentUser).toBeNull();
  });

  it("with an email, creates the profile as usual", async () => {
    fb.result = { user: githubUser("octo@example.com"), isNew: true };
    await act(async () => {
      await api.signInWith(GITHUB_PROVIDER);
    });
    expect(callApi).toHaveBeenCalledWith("ensure-profile", expect.anything());
  });
});
