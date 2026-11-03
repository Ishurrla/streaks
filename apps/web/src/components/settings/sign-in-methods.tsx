"use client";

import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import { authErrorFromCode } from "@/lib/validation";
import {
  canDisconnect,
  GOOGLE_PROVIDER,
  googleSettingsError,
  isGoogleOnly,
  PASSWORD_PROVIDER,
  validateNewPassword,
} from "@/lib/sign-in";

const codeOf = (err: unknown) => (err instanceof FirebaseError ? err.code : undefined);

const CONNECTED_PILL = "flex-none rounded-full bg-done-soft px-3 py-1.5 text-[13px] font-bold";

export function SignInMethodsSection({
  user,
  providers,
  onChanged,
}: {
  user: User;
  providers: string[];
  onChanged: () => void;
}) {
  const { connectGoogle, disconnectGoogle } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = providers.includes(PASSWORD_PROVIDER);
  const hasGoogle = providers.includes(GOOGLE_PROVIDER);
  const googleEmail = user.providerData.find((p) => p.providerId === GOOGLE_PROVIDER)?.email ?? user.email;

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

  const note = !hasGoogle
    ? "Connect Google to sign in with one tap next time."
    : hasPassword
      ? "You can sign in with either method. Disconnecting is allowed because your password still works."
      : "You signed up with Google and have no password. Disconnect is switched off so you cannot lock yourself out. Add a password first.";

  return (
    <section className="panel mb-3.5" aria-labelledby="sec-sign-in-methods">
      <h2 id="sec-sign-in-methods" className="mb-0.5 text-lg">
        Sign-in methods
      </h2>
      <p className="mb-2.5 text-sm text-muted">The ways you can get into your account.</p>

      <div className="method">
        <div className="method-meta">
          <div className="method-title">Email and password</div>
          <div className="method-detail">{hasPassword ? user.email : "Not connected"}</div>
        </div>
        {hasPassword && <span className={CONNECTED_PILL}>Connected</span>}
      </div>

      <div className="method">
        <div className="method-meta">
          <div className="method-title">Google</div>
          <div className="method-detail">{hasGoogle ? googleEmail : "Not connected"}</div>
        </div>
        {hasGoogle && <span className={CONNECTED_PILL}>Connected</span>}
        {hasGoogle ? (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            disabled={busy || !canDisconnect(providers, GOOGLE_PROVIDER)}
            onClick={() => run(disconnectGoogle, "Google disconnected.", () => "Could not disconnect Google. Try again.")}
          >
            Disconnect
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-small"
            type="button"
            disabled={busy}
            onClick={() => run(connectGoogle, "Google connected.", googleSettingsError)}
          >
            Connect
          </button>
        )}
      </div>

      <div className="note note-info mt-2.5!">{note}</div>
      {error && (
        <div className="note note-error" role="alert">
          {error}
        </div>
      )}

      {isGoogleOnly(providers) && <SetPasswordForm onChanged={onChanged} />}
    </section>
  );
}

function SetPasswordForm({ onChanged }: { onChanged: () => void }) {
  const { setPassword } = useAuth();
  const toast = useToast();
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string | null }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateNewPassword(password, confirm);
    setErrors(invalid);
    if (invalid.password || invalid.confirm) return;

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
          : { form: googleSettingsError(code) },
      );
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 border-t border-line pt-3" onSubmit={submit} noValidate>
      <div className="method-title">Set a password</div>
      <p className="text-sm text-muted">Google will ask you to confirm it is you first.</p>
      <label className="field-label" htmlFor="new-password">
        New password
      </label>
      <input
        id="new-password"
        className="input"
        type="password"
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
      <input
        id="confirm-password"
        className="input"
        type="password"
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
