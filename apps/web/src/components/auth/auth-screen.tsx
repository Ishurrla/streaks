"use client";

import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Flame } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useAuth } from "@/lib/auth";
import {
  authErrorFromCode,
  isEmail,
  safeNext,
  validateAuth,
  type AuthErrors,
  type AuthFields,
  type AuthMode,
} from "@/lib/validation";

const COPY = {
  signup: {
    title: "Keep the chain going.",
    lead: "Small habits, checked off daily. Miss a day and the streak starts over, so show up.",
    submit: "Create account",
    busy: "Creating account…",
  },
  login: {
    title: "Welcome back.",
    lead: "Your streaks are waiting for you.",
    submit: "Log in",
    busy: "Logging in…",
  },
} as const;

function Field({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <div id={`${id}-error`} className="err">
          {error}
        </div>
      )}
    </>
  );
}

/**
 * Sign up / log in. `?next=` (set by the auth guard) says where to go afterwards.
 * Reading it needs a Suspense boundary; the fallback is the same form without it, so
 * the prerendered HTML is the real page.
 */
export function AuthScreen({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={<AuthForm mode={mode} nextParam={null} />}>
      <AuthScreenWithParams mode={mode} />
    </Suspense>
  );
}

function AuthScreenWithParams({ mode }: { mode: AuthMode }) {
  const params = useSearchParams();
  return <AuthForm mode={mode} nextParam={params.get("next")} />;
}

function AuthForm({ mode, nextParam }: { mode: AuthMode; nextParam: string | null }) {
  const router = useRouter();
  const next = safeNext(nextParam);
  const { state, signUp, logIn, sendPasswordReset } = useAuth();
  const toast = useToast();

  const [fields, setFields] = useState<AuthFields>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const copy = COPY[mode];
  const signup = mode === "signup";

  // Already signed in (or just signed in): go to the app.
  useEffect(() => {
    if (state.status === "signedIn") router.replace(next);
  }, [state.status, next, router]);

  const query = nextParam ? `?next=${encodeURIComponent(next)}` : "";

  function update(key: keyof AuthFields) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));
  }

  function focusFirstError(errs: AuthErrors) {
    const first = (["name", "email", "password"] as const).find((k) => errs[k]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`#${first}`)?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateAuth(mode, fields);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstError(errs);

    setBusy(true);
    try {
      if (signup) {
        await signUp(fields.name, fields.email, fields.password);
        toast(`Welcome, ${fields.name.trim()}. Add your first habit.`);
      } else {
        await logIn(fields.email, fields.password);
        toast("Welcome back.");
      }
    } catch (err) {
      const mapped = authErrorFromCode(err instanceof FirebaseError ? err.code : undefined);
      setErrors(mapped);
      focusFirstError(mapped);
      setBusy(false);
    }
  }

  async function onForgot() {
    if (!isEmail(fields.email)) {
      const errs = { email: "Enter your email above and we will send a reset link." };
      setErrors(errs);
      return focusFirstError(errs);
    }
    try {
      await sendPasswordReset(fields.email);
    } catch (err) {
      // Unknown emails are not revealed; only real failures are shown.
      if (err instanceof FirebaseError && err.code !== "auth/user-not-found") {
        setErrors(authErrorFromCode(err.code));
        return;
      }
    }
    toast(`If ${fields.email.trim()} has an account, a reset link is on its way.`);
  }

  return (
    <div className="flex min-h-dvh">
      <div className="hidden flex-1 flex-col justify-between bg-accent p-12 text-accent-ink desk:flex">
        <div className="flex items-center gap-2 font-display text-[22px] font-extrabold">
          <Flame live />
          Streaks
        </div>
        <div>
          <div className="flex items-center gap-3 font-display text-[150px] leading-[.9] font-extrabold" aria-hidden="true">
            <Flame live className="size-[110px]!" />
            47
          </div>
          <p className="max-w-[24ch] text-xl opacity-90">The streak is just proof you showed up.</p>
        </div>
        <div />
      </div>

      <main className="flex flex-1 flex-col px-[22px] pt-9 pb-7 desk:justify-center desk:p-14 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[400px]">
        <div className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Flame live />
          Streaks
        </div>
        <div className="mt-1.5">
          <Link className="link" href="/">
            Back to home
          </Link>
        </div>
        <h1 className="mt-7 mb-2 text-[34px] leading-[1.05] font-extrabold">{copy.title}</h1>
        <p className="mb-5 text-muted">{copy.lead}</p>

        <nav className="seg mb-1.5" aria-label="Sign up or log in">
          <Link href={`/signup${query}`} aria-current={signup ? "page" : undefined} replace>
            Sign up
          </Link>
          <Link href={`/login${query}`} aria-current={signup ? undefined : "page"} replace>
            Log in
          </Link>
        </nav>

        <form ref={formRef} onSubmit={onSubmit} noValidate>
          {signup && (
            <Field
              id="name"
              label="Your name"
              autoComplete="given-name"
              maxLength={50}
              value={fields.name}
              onChange={update("name")}
              error={errors.name}
            />
          )}
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={update("email")}
            error={errors.email}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            value={fields.password}
            onChange={update("password")}
            error={errors.password}
          />
          {errors.form && (
            <div className="err mt-4! text-sm!" role="alert">
              {errors.form}
            </div>
          )}
          <div className="mt-[22px]">
            <button className="btn btn-block" type="submit" disabled={busy}>
              {busy ? copy.busy : copy.submit}
            </button>
          </div>
        </form>

        {!signup && (
          <div className="mt-4 text-center">
            <button className="link" type="button" onClick={onForgot}>
              Forgot your password?
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
