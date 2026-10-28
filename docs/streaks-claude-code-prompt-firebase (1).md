# Streaks: habit tracker with server-side streaks (Firebase)

Build a habit tracker called **Streaks**. Users sign up, add daily habits, check them off on a Today screen, and see current streak, best streak and a calendar. Miss a day and that habit's streak goes back to zero.

The point of this project is the **backend**: auth, private data, data rules, a scheduled job, and server-side logic. Keep the frontend simple but faithful to the design reference.

## Design reference

`docs/design/streaks-prototype.html` is a clickable prototype of the whole app. Open it in a browser and click through every screen before writing UI code. Match its layout, copy, colours, spacing and animations. It uses fake in-memory data, so do not copy its JavaScript logic. Treat it as a visual and behavioural spec only.

Screens: landing page, sign up / log in (split layout on desktop), Today (with the empty first-run state), Habits (add/edit/remove sheet), Progress (per-habit calendar), Settings. Layout is a bottom tab bar on mobile and a left sidebar from 900px up.

Animations to keep (all must respect `prefers-reduced-motion`):
- Checking a habit: tick draws itself, coloured ripple off the circle, card glow, streak number pops in, small confetti burst.
- Completing every habit for the day: full-screen confetti fall, "All done for today" card with a rising flame, progress ring turns flame-coloured and pulses.
- New habit cards slide in.

Ignore the "Skip to next day", "See landing page" and "See sign up" buttons in the prototype's top bar. They are prototype-only.

## Stack

- Firebase: Authentication (email and password), Cloud Firestore, Cloud Functions 2nd gen in TypeScript (callable functions and scheduled functions), Firebase Emulator Suite for all local development.
- Frontend: Next.js (App Router) + TypeScript, Tailwind CSS v4, TanStack Query, Firebase JS SDK. pnpm. The landing page is a server component. Everything that touches Firebase Auth, Firestore or callables is a client component, and route protection is a client-side auth guard (no server sessions or Admin SDK in Next.js). Deploy the frontend to Vercel and the functions to Firebase.
- Layout: app in `apps/web`, Firebase config (`firebase.json`, `firestore.rules`, `firestore.indexes.json`) at the repo root, functions in `functions/`.
- Build and test everything against the emulators first. I will deal with the Blaze plan and deploying later, so do not make anything depend on a live project.

## Data model (Firestore)

- `users/{uid}`: `name`, `timezone` (IANA string, default `Africa/Lagos`), `reminderEnabled`, `reminderTime`, `theme`, `freezesAvailable` (default 1), `nextRolloverAt` (timestamp, the UTC instant of the user's next local midnight), `lastReminderDate`.
- `users/{uid}/habits/{habitId}`: `name` (1 to 40 chars), `color`, `createdAt`, plus server-owned stats: `currentStreak`, `bestStreak`, `lastCheckInDate`.
- `users/{uid}/habits/{habitId}/checkIns/{localDate}`: the **document ID is the date** (`YYYY-MM-DD`, in the user's timezone). One document per habit per day, so a second check-in for the same day cannot exist.
- `users/{uid}/habits/{habitId}/freezeUses/{localDate}`: a freeze counts as a completed day when working out streaks.

## Rules that must hold

1. **Private data.** Write `firestore.rules` so a user can only read their own documents under `users/{uid}`. Deny everything else by default. Use field-level validation:
   - Clients can update only `name`, `reminderEnabled`, `reminderTime` and `theme` on their user doc. They cannot touch `freezesAvailable`, `timezone`, `nextRolloverAt` or `lastReminderDate`.
   - Clients can create a habit only with `currentStreak` and `bestStreak` at 0 and `lastCheckInDate` null. They can update only `name` and `color`.
   - Clients cannot write `checkIns` or `freezeUses` at all.
2. **One check-in per habit per day**, enforced by the date-as-document-ID design (create, never overwrite). A second attempt must be harmless (idempotent), never an error screen.
3. **The client never sends a date.** Check-ins go through a callable function `checkIn({ habitId })`. It verifies the habit belongs to `request.auth.uid`, reads the user's timezone, works out today's date on the server, creates the check-in inside a transaction, and recomputes the habit's stats. Add `undoCheckIn({ habitId })` that only works for today. Both reject unauthenticated callers.
4. **Streaks are computed on the server.** The current streak is the run of consecutive days ending today, or ending yesterday if today is not done yet (so a streak is "at risk" until midnight, not broken). Best streak is the longest run ever. Write the calculation as one pure TypeScript function (`computeStreaks(checkInDates, freezeDates, today)`) and reuse it everywhere. The frontend only displays the stats on the habit doc and never calculates streaks. The frontend may work out today's date string from the saved timezone **for display only** (to know which check-in doc to look at), and never sends it.
5. **Past days are locked.** Nobody can add or remove a check-in for a past date.
6. **Cascade deletes.** Firestore does not delete subcollections. Deleting a habit goes through a callable `deleteHabit` that uses `recursiveDelete`, and deleting an account goes through `deleteAccount`, which removes the whole `users/{uid}` tree and then the auth user.
7. **Profile creation.** A callable `ensureProfile` creates the user doc (with `nextRolloverAt` set) on first sign-in. It must be safe to call repeatedly. A callable `updateTimezone` is the only way to change timezone, and it recomputes `nextRolloverAt`.
8. **Nightly reset.** A scheduled function runs **every 15 minutes** and queries users where `nextRolloverAt <= now`, so each person's day ends at their own midnight. For each of their habits that was not done on the day that just ended: if `freezesAvailable > 0` and exactly one day was missed, spend a freeze (decrement, write `freezeUses`) and keep the streak; otherwise set `currentStreak` to 0. Then move `nextRolloverAt` to the next local midnight. This makes the job idempotent: running it twice changes nothing the second time. Put the logic in an exported `runRollover(now)` and keep the scheduler wrapper thin, so tests can pass in a fake clock. Process users in pages, and handle one user's failure without stopping the rest.
9. **Reminders** (last phase). A second scheduled function finds users with reminders on whose local time has passed `reminderTime`, who have unchecked habits today and whose `lastReminderDate` is not today, then sends one email and sets `lastReminderDate`. Use Resend, and log the message instead of sending when no API key is set. Same pattern: exported `runReminders(now)` with a thin wrapper.
10. Secrets (Resend key, any service account) go in function config or environment, never in git or the browser.

## Frontend behaviour

- Auth with email and password, with the validation messages shown in the prototype. Call `ensureProfile` after sign-in. Protected routes (a layout under `app/(app)/`) redirect to log in. The landing page is public.
- Today: subscribe to the habits and today's check-in documents so the screen stays in sync. Check-off is optimistic through the `checkIn` callable, rolling back with an error toast if it fails. Show the "at risk" state, the progress ring, the "This week" strip and the all-done celebration.
- Habits: add, edit through Firestore under the rules, remove through `deleteHabit`, with the colour picker and delete confirmation. A first-run empty state offers one-tap suggestions.
- Progress: pick a habit, show current and best streak and a month calendar with previous and next month. Read-only.
- Settings: profile, theme (light, dark, follow device, saved on the user doc), time zone through `updateTimezone`, reminders, streak freeze count, password reset email, log out, delete account through `deleteAccount`.
- Loading, empty and error states on every screen. Keyboard focus styles and proper labels on all inputs.

## How to work

Work in phases. **Stop after each phase, summarise what you did and how to verify it, and wait for me to say go.** Commit at the end of each phase with a clear message.

1. Repo setup, Firebase project config, emulators running, `firestore.rules`, and `ensureProfile`.
2. `computeStreaks`, `checkIn`, `undoCheckIn`, `deleteHabit`, with tests.
3. `runRollover`, freeze logic, `updateTimezone`, and the scheduled wrapper, with tests.
4. Frontend: auth, routing, landing page, app shell.
5. Frontend: Today, Habits, Progress, Settings, animations, wired to the emulators.
6. Reminders, `deleteAccount`, and a short deployment checklist for me (Blaze plan, budget alert, env config, deploy commands).

Tests (Vitest, `@firebase/rules-unit-testing` for rules, and the Functions emulator for callables). Each must fail if the rule were broken:
- User B cannot read, update or delete user A's documents, and cannot check in on A's habit.
- A client cannot write `checkIns`, `freezeUses`, or any stat or server-owned field.
- Checking in twice in one day leaves one document and does not error.
- `computeStreaks` cases: 0 days, today only, yesterday only (alive, at risk), a gap (reset), best streak kept after a reset, freeze bridging one missed day, month and year boundaries.
- Timezone case: the same instant is "today" in one timezone and "tomorrow" in another.
- `runRollover`: breaks a missed streak, spends a freeze once, leaves done habits alone, only touches users whose midnight has passed, and is safe to run twice.

Before you start, tell me anything in this brief that is ambiguous or that you disagree with, then begin phase 1.
