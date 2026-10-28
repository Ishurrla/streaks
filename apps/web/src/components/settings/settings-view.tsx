"use client";

import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { PageHead } from "@/components/views/page-head";
import { useAuth } from "@/lib/auth";
import { callUpdateTimezone } from "@/lib/data";
import { db, realPushAvailable } from "@/lib/firebase";
import { deviceToken, disablePushOnThisDevice, enablePushOnThisDevice, PushBlockedError, pushSupport, type PushSupport } from "@/lib/push";
import { useProfile } from "@/lib/profile";
import { applyTheme } from "@/lib/theme";
import type { Profile, Theme } from "@/lib/types";

const TIMEZONES: [string, string][] = [
  ["Africa/Lagos", "Lagos (WAT)"],
  ["Africa/Nairobi", "Nairobi (EAT)"],
  ["Europe/London", "London"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "Mumbai"],
  ["Asia/Tokyo", "Tokyo"],
  ["America/New_York", "New York"],
];

const THEMES: [Theme, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Device"],
];

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  const id = `sec-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className="panel mb-3.5" aria-labelledby={id}>
      <h2 id={id} className="mb-0.5 text-lg">
        {title}
      </h2>
      {desc && <p className="mb-2 text-sm text-muted">{desc}</p>}
      {children}
    </section>
  );
}

export function SettingsView() {
  const profile = useProfile();
  const toast = useToast();
  const { state, logOut, sendPasswordReset, deleteAccount } = useAuth();
  const router = useRouter();
  const email = state.status === "signedIn" ? state.user.email : null;
  const userRef = doc(db, "users", profile.uid);

  // Writes only the fields the rules allow the client to change.
  async function save(fields: Partial<Pick<Profile, "name" | "theme" | "reminderEnabled" | "reminderTime">>, done?: string) {
    try {
      await updateDoc(userRef, fields);
      if (done) toast(done);
      return true;
    } catch {
      toast("Could not save that change. Try again.");
      return false;
    }
  }

  return (
    <>
      <PageHead title="Settings" />
      <ProfileSection key={profile.name} name={profile.name} email={email} onSave={(name) => save({ name }, "Profile saved.")} />

      <Section title="Appearance" desc="Pick a look, or follow your device.">
        <div className="seg grid-cols-3!" role="group" aria-label="Theme">
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={profile.theme === value}
              onClick={async () => {
                const before = profile.theme;
                applyTheme(value);
                if (!(await save({ theme: value }))) applyTheme(before);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <TimezoneSection timezone={profile.timezone} />

      <RemindersSection
        enabled={profile.reminderEnabled}
        time={profile.reminderTime}
        onSave={save}
      />

      <Section title="Streak freeze">
        <div className="flex items-center justify-between gap-3.5 py-1.5">
          <div className="text-sm text-muted">Saves a streak once if you miss a day.</div>
          <span className="flex-none rounded-full bg-done-soft px-3 py-1.5 text-sm font-bold">
            {profile.freezesAvailable} available
          </span>
        </div>
      </Section>

      <AccountSection
        email={email}
        onReset={async () => {
          if (!email) return;
          try {
            await sendPasswordReset(email);
            toast(`Reset link sent to ${email}.`);
          } catch {
            toast("Could not send the reset link. Try again.");
          }
        }}
        onLogOut={() => logOut()}
        onDelete={async (password) => {
          await deleteAccount(password);
          router.replace("/");
          toast("Account deleted.");
        }}
      />
    </>
  );
}

function ProfileSection({
  name: savedName,
  email,
  onSave,
}: {
  name: string;
  email: string | null;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(savedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter your name.");
    setError(null);
    setBusy(true);
    await onSave(trimmed);
    setBusy(false);
  }

  return (
    <Section title="Profile" desc="How you show up in the app.">
      <form onSubmit={submit} noValidate>
        <label className="field-label" htmlFor="settings-name">
          Name
        </label>
        <input
          id="settings-name"
          className="input"
          autoComplete="given-name"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "settings-name-error" : undefined}
        />
        {error && (
          <div id="settings-name-error" className="err">
            {error}
          </div>
        )}
        <label className="field-label" htmlFor="settings-email">
          Email
        </label>
        <input
          id="settings-email"
          className="input opacity-70"
          type="email"
          value={email ?? ""}
          readOnly
          aria-describedby="settings-email-note"
        />
        <p id="settings-email-note" className="mt-1.5 text-[13px] text-muted">
          This is the email you log in with.
        </p>
        <div className="mt-4 flex">
          <button className="btn" type="submit" disabled={busy || name.trim() === savedName}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function TimezoneSection({ timezone }: { timezone: string }) {
  const toast = useToast();
  // The zone being saved; shown until the profile snapshot catches up.
  const [saving, setSaving] = useState<string | null>(null);
  const device = deviceTimezone();
  const options = [...TIMEZONES];
  for (const tz of [timezone, device]) {
    if (tz && !options.some(([v]) => v === tz)) options.push([tz, tz.replace(/_/g, " ")]);
  }

  return (
    <Section title="Time zone" desc="Your day ends at midnight where you are, so a streak never breaks early.">
      <select
        className="input"
        aria-label="Time zone"
        value={saving ?? timezone}
        disabled={saving !== null}
        onChange={async (e) => {
          const value = e.target.value;
          const label = options.find(([v]) => v === value)?.[1] ?? value;
          setSaving(value);
          try {
            await callUpdateTimezone(value);
            toast(`Your day now ends at midnight in ${label}.`);
          } catch {
            toast("Could not change your time zone. Try again.");
          } finally {
            setSaving(null);
          }
        }}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
            {value === device ? " (this device)" : ""}
          </option>
        ))}
      </select>
    </Section>
  );
}

function AccountSection({
  email,
  onReset,
  onLogOut,
  onDelete,
}: {
  email: string | null;
  onReset: () => void;
  onLogOut: () => void;
  onDelete: (password: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete(e: FormEvent) {
    e.preventDefault();
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError(null);
    try {
      await onDelete(password);
    } catch (err) {
      setBusy(false);
      const code = err instanceof FirebaseError ? err.code : "";
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password"
          ? "That password is not right."
          : code === "auth/too-many-requests"
            ? "Too many tries. Wait a minute and try again."
            : "Could not delete your account. Try again.",
      );
    }
  }

  return (
    <Section title="Account">
      <div className="mt-1.5 flex flex-col gap-2.5">
        <button className="btn btn-ghost" type="button" onClick={onReset} disabled={!email}>
          Email me a password reset link
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLogOut}>
          Log out
        </button>
        {confirming ? (
          <form onSubmit={confirmDelete} noValidate>
            <p className="mt-2 font-medium" role="alert">
              Delete your account and every habit and check-in? This cannot be undone.
            </p>
            <label className="field-label" htmlFor="delete-password">
              Enter your password to confirm
            </label>
            <input
              id="delete-password"
              className="input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "delete-password-error" : undefined}
            />
            {error && (
              <div id="delete-password-error" className="err">
                {error}
              </div>
            )}
            <div className="mt-4 flex gap-2.5">
              <button
                className="btn btn-ghost flex-1"
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setError(null);
                }}
              >
                Keep my account
              </button>
              <button className="btn btn-danger flex-1" type="submit" disabled={busy}>
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-danger" type="button" onClick={() => setConfirming(true)}>
            Delete account
          </button>
        )}
      </div>
    </Section>
  );
}

const PUSH_MESSAGES = {
  blocked:
    "Notifications are blocked for Streaks in this browser. Allow them in your browser's site settings, then try again.",
  dismissed: "Allow notifications when your browser asks, so we can send your reminder.",
  unsupported:
    "This browser cannot show notifications. On iPhone or iPad, add Streaks to your Home Screen first, then turn reminders on from there.",
};

/**
 * The switch is the user-level setting. Turning it on asks for notification permission
 * (only from that click) and registers this device; turning it off removes this
 * device's token and stops reminders everywhere.
 */
function RemindersSection({
  enabled,
  time,
  onSave,
}: {
  enabled: boolean;
  time: string;
  onSave: (fields: { reminderEnabled?: boolean; reminderTime?: string }, done?: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [onThisDevice, setOnThisDevice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushSupport().then((s) => {
      setSupport(s);
      setOnThisDevice(!!deviceToken());
    });
  }, []);

  // Must run straight from a click, so the browser allows the permission prompt.
  async function addThisDevice(): Promise<boolean> {
    if (support === "unsupported") {
      setMessage(PUSH_MESSAGES.unsupported);
      return false;
    }
    try {
      await enablePushOnThisDevice();
      setOnThisDevice(true);
      setMessage(null);
      return true;
    } catch (err) {
      if (err instanceof PushBlockedError) {
        const blocked = err.message === "denied";
        if (blocked) setSupport("blocked");
        setMessage(blocked ? PUSH_MESSAGES.blocked : PUSH_MESSAGES.dismissed);
      } else {
        toast("Could not turn on reminders. Try again.");
      }
      return false;
    }
  }

  async function toggle() {
    setBusy(true);
    if (!enabled) {
      if ((await addThisDevice()) && (await onSave({ reminderEnabled: true }))) {
        toast(`Reminders on. We will nudge you at ${time} if a habit is still not done.`);
      }
    } else {
      await disablePushOnThisDevice();
      setOnThisDevice(false);
      if (await onSave({ reminderEnabled: false })) toast("Reminders off.");
    }
    setBusy(false);
  }

  return (
    <Section title="Reminders">
      <div className="flex items-center justify-between gap-3.5 py-1.5">
        <div>
          <div className="font-bold" id="reminder-label">
            Evening reminder
          </div>
          <div className="text-sm text-muted">A nudge if a habit is still not done.</div>
        </div>
        <button
          className="switch disabled:opacity-60"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="reminder-label"
          aria-describedby={message ? "reminder-message" : undefined}
          disabled={busy || support === null}
          onClick={toggle}
        />
      </div>

      {message && (
        <p id="reminder-message" className="err text-sm!" role="alert">
          {message}
        </p>
      )}

      {enabled && (
        <>
          {!onThisDevice && support === "supported" && (
            <button
              className="link -ml-1.5"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                if (await addThisDevice()) toast("This device will get reminders too.");
                setBusy(false);
              }}
            >
              Also remind me on this device
            </button>
          )}
          <label className="field-label" htmlFor="reminder-time">
            Remind me at
          </label>
          <input
            id="reminder-time"
            className="input"
            type="time"
            defaultValue={time}
            onChange={(e) => {
              const value = e.target.value;
              if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== time) {
                onSave({ reminderTime: value }, `Reminder set for ${value}.`);
              }
            }}
          />
        </>
      )}

      {!realPushAvailable && (
        <p className="mt-3 text-[13px] text-muted">
          Local mode: push is not set up, so the emulator logs reminders instead of sending them.
        </p>
      )}
    </Section>
  );
}
