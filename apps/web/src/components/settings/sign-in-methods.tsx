"use client";

import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { authErrorFromCode } from "@/lib/validation";
import {
  canDisconnect,
  GITHUB_PROVIDER,
  GOOGLE_PROVIDER,
  isOnlyWayIn,
  PASSWORD_PROVIDER,
  PROVIDER_NAME,
  reauthProvider,
  remainingMethods,
  settingsError,
  validateNewPassword,
  type PopupProvider,
} from "@/lib/sign-in";

const codeOf = (err: unknown) => (err instanceof FirebaseError ? err.code : undefined);

const CONNECTED_PILL = "flex-none rounded-full bg-done-soft px-3 py-1.5 text-[13px] font-bold";
const ONLY_WAY_IN = "Your only way in. Add another method first.";

export function SignInMethodsSection({
  user,
  providers,
  onChanged,
}: {
  user: User;
  providers: string[];
  onChanged: () => void;
}) {
  const { connect, disconnect } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmGitHub, setConfirmGitHub] = useState(false);

  const hasPassword = providers.includes(PASSWORD_PROVIDER);
  const confirmWith = reauthProvider(providers);

  async function run(action: () => Promise<void>, done: string, unexpected: (code: string | undefined) => string | null) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      toast(done);
    } catch (err) {
      setError(unexpected(codeOf(err)));
    } finally {
      setBusy(false);
    }
  }

  /** A Google or GitHub row: its email from providerData, and Connect or Disconnect. */
  function providerRow(provider: PopupProvider, onDisconnect: () => void) {
    const name = PROVIDER_NAME[provider];
    const connected = providers.includes(provider);
    const email = user.providerData.find((p) => p.providerId === provider)?.email;
    const only = isOnlyWayIn(providers, provider);
    return (
      <div className="method">
        <div className="method-meta">
          <div className="method-title">{name}</div>
          <div className="method-detail">{connected ? (email ?? "Connected") : "Not connected"}</div>
          {only && <div className="method-detail">{ONLY_WAY_IN}</div>}
        </div>
        {connected && <span className={CONNECTED_PILL}>Connected</span>}
        {connected ? (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            aria-label={`Disconnect ${name}`}
            disabled={busy || !canDisconnect(providers, provider)}
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            aria-label={`Connect ${name}`}
            disabled={busy}
            onClick={() => run(() => connect(provider), `${name} connected.`, (code) => settingsError(provider, code))}
          >
            Connect
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="panel mb-3.5" aria-labelledby="sec-sign-in-methods">
      <h2 id="sec-sign-in-methods" className="mb-0.5 text-lg">
        Sign-in methods
      </h2>
      <p className="mb-2.5 text-sm text-muted">The ways you can get into your account.</p>

      <div className="method">
        <div className="method-meta">
          <div className="method-title">Email and password</div>
          <div className="method-detail">{hasPassword ? user.email : "Not set"}</div>
          {isOnlyWayIn(providers, PASSWORD_PROVIDER) && <div className="method-detail">{ONLY_WAY_IN}</div>}
        </div>
        {hasPassword && <span className={CONNECTED_PILL}>Connected</span>}
      </div>

      {providerRow(GOOGLE_PROVIDER, () =>
        run(() => disconnect(GOOGLE_PROVIDER), "Google disconnected.", () => "Could not disconnect Google. Try again."),
      )}
      {providerRow(GITHUB_PROVIDER, () => setConfirmGitHub(true))}

      <div className="note note-info mt-2.5!">
        {providers.length > 1 ? "You can sign in with any connected method." : "Connect another method so you are never locked out."}
      </div>
      {error && (
        <div className="note note-error" role="alert">
          {error}
        </div>
      )}

      {confirmWith && <SetPasswordForm provider={confirmWith} onChanged={onChanged} />}

      <Sheet open={confirmGitHub} onClose={() => setConfirmGitHub(false)} labelledBy="disconnect-github-title">
        <h2 id="disconnect-github-title" className="mb-1.5!">
          Disconnect GitHub?
        </h2>
        <p className="text-muted">You will still be able to sign in with {remainingMethods(providers, GITHUB_PROVIDER)}.</p>
        <div className="mt-[22px] flex gap-2.5">
          <button className="btn btn-ghost flex-1" type="button" onClick={() => setConfirmGitHub(false)} autoFocus>
            Keep it
          </button>
          <button
            className="btn btn-danger flex-1"
            type="button"
            onClick={() => {
              setConfirmGitHub(false);
              run(() => disconnect(GITHUB_PROVIDER), "GitHub disconnected.", () => "Could not disconnect GitHub. Try again.");
            }}
          >
            Disconnect
          </button>
        </div>
      </Sheet>
    </section>
  );
}

function SetPasswordForm({ provider, onChanged }: { provider: PopupProvider; onChanged: () => void }) {
  const { setPassword } = useAuth();
  const toast = useToast();
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string | null }>({});
  const [busy, setBusy] = useState(false);
  // Bumped after each failed attempt, which hides both passwords again.
  const [failures, setFailures] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateNewPassword(password, confirm);
    setErrors(invalid);
    if (invalid.password || invalid.confirm) return setFailures((n) => n + 1);

    setBusy(true);
    try {
      await setPassword(password);
      onChanged();
      toast("Password set. You can now sign in with either method.");
    } catch (err) {
      const code = codeOf(err);
      setErrors(
        code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements"
          ? { password: authErrorFromCode(code).password }
          : { form: settingsError(provider, code) },
      );
      setFailures((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 border-t border-line pt-3" onSubmit={submit} noValidate>
      <div className="method-title">Set a password</div>
      <p className="text-sm text-muted">{PROVIDER_NAME[provider]} will ask you to confirm it is you first.</p>
      <label className="field-label" htmlFor="new-password">
        New password
      </label>
      <PasswordInput
        id="new-password"
        resetKey={failures}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={errors.password ? true : undefined}
        aria-describedby={errors.password ? "new-password-error" : undefined}
      />
      {errors.password && (
        <div id="new-password-error" className="err">
          {errors.password}
        </div>
      )}
      <label className="field-label" htmlFor="confirm-password">
        Confirm password
      </label>
      <PasswordInput
        id="confirm-password"
        resetKey={failures}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={errors.confirm ? true : undefined}
        aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
      />
      {errors.confirm && (
        <div id="confirm-password-error" className="err">
          {errors.confirm}
        </div>
      )}
      {errors.form && (
        <div className="note note-error" role="alert">
          {errors.form}
        </div>
      )}
      <button className="btn btn-block mt-4" type="submit" disabled={busy}>
        {busy ? "Setting your password…" : "Set a password"}
      </button>
    </form>
  );
}
