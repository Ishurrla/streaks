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

- Firebase (Spark plan): Authentication (email and password), Cloud Firestore, Cloud Messaging, and the Auth and Firestore emulators for all local development. Server logic runs in Next.js route handlers on Vercel (Node runtime) using the Firebase Admin SDK, not in Cloud Functions. The scheduled jobs are cron endpoints called every 15 minutes by cron-job.org (two jobs, `POST` with `Authorization: Bearer <CRON_SECRET>`); a GitHub Actions workflow calls them too, as a backup only, because GitHub throttles scheduled runs.
- Frontend: Next.js (App Router) + TypeScript, Tailwind CSS v4, TanStack Query, Firebase JS SDK. pnpm. The landing page is a server component. Everything that touches Firebase Auth, Firestore or the server routes is a client component, and route protection is a client-side auth guard (no server sessions). The Admin SDK is used only inside route handlers, which verify the caller's Firebase ID token. Deploy the app and its routes to Vercel, and the Firestore rules and indexes to Firebase.
- Layout: app in `apps/web`, shared server logic in `packages/core`, Firebase config (`firebase.json`, `firestore.rules`, `firestore.indexes.json`) at the repo root.
- Build and test everything against the emulators first. I will deal with the Blaze plan and deploying later, so do not make anything depend on a live project.

## Data model (Firestore)

- `users/{uid}`: `name`, `timezone` (IANA string, default `Africa/Lagos`), `reminderEnabled`, `reminderTime`, `theme`, `freezesAvailable` (default 1), `nextRolloverAt` (timestamp, the UTC instant of the user's next local midnight), `lastReminderDate`.
- `users/{uid}/habits/{habitId}`: `name` (1 to 40 chars), `color`, `createdAt`, `days` (see "Habit schedules and milestones"), plus server-owned fields: `currentStreak`, `bestStreak`, `lastCheckInDate`, `milestonesEarned`, `nextDays`, `nextDaysFrom`, `pastDays`.
- `users/{uid}/habits/{habitId}/checkIns/{localDate}`: the **document ID is the date** (`YYYY-MM-DD`, in the user's timezone). One document per habit per day, so a second check-in for the same day cannot exist. It also records `milestonesAdded`, so undoing it takes back exactly those milestones.
- `users/{uid}/habits/{habitId}/freezeUses/{localDate}`: a freeze counts as a completed day when working out streaks.
- `users/{uid}/pushTokens/{tokenId}`: `token` (FCM web push token), `createdAt`, `userAgent`. One user can have several devices.

## Rules that must hold

Where these rules say "callable" or "callable function", read a POST route handler of the same name (for example `checkIn` is `/api/check-in`) whose caller is the uid in the verified ID token. Where they say "scheduled function", read a cron endpoint called every 15 minutes. Where they say "function config", read the server environment (Vercel environment variables). The rules themselves are unchanged.

1. **Private data.** Write `firestore.rules` so a user can only read their own documents under `users/{uid}`. Deny everything else by default. Use field-level validation:
   - Clients can update only `name`, `reminderEnabled`, `reminderTime` and `theme` on their user doc. They cannot touch `freezesAvailable`, `timezone`, `nextRolloverAt` or `lastReminderDate`.
   - Clients can create a habit only with `currentStreak` and `bestStreak` at 0 and `lastCheckInDate` null. They can update only `name` and `color`.
   - Clients cannot write `checkIns`, `freezeUses` or `pushTokens` at all (tokens are saved through callables).
2. **One check-in per habit per day**, enforced by the date-as-document-ID design (create, never overwrite). A second attempt must be harmless (idempotent), never an error screen.
3. **The client never sends a date.** Check-ins go through a callable function `checkIn({ habitId })`. It verifies the habit belongs to `request.auth.uid`, reads the user's timezone, works out today's date on the server, creates the check-in inside a transaction, and recomputes the habit's stats. Add `undoCheckIn({ habitId })` that only works for today. Both reject unauthenticated callers.
4. **Streaks are computed on the server.** The current streak is the run of consecutive days ending today, or ending yesterday if today is not done yet (so a streak is "at risk" until midnight, not broken). Best streak is the longest run ever. Write the calculation as one pure TypeScript function (`computeStreaks(checkInDates, freezeDates, today)`) and reuse it everywhere. The frontend only displays the stats on the habit doc and never calculates streaks. The frontend may work out today's date string from the saved timezone **for display only** (to know which check-in doc to look at), and never sends it.
5. **Past days are locked.** Nobody can add or remove a check-in for a past date.
6. **Cascade deletes.** Firestore does not delete subcollections. Deleting a habit goes through a callable `deleteHabit` that uses `recursiveDelete`, and deleting an account goes through `deleteAccount`, which removes the whole `users/{uid}` tree and then the auth user.
7. **Profile creation.** A callable `ensureProfile` creates the user doc (with `nextRolloverAt` set) on first sign-in. It must be safe to call repeatedly. A callable `updateTimezone` is the only way to change timezone, and it recomputes `nextRolloverAt`.
8. **Nightly reset.** A scheduled function runs **every 15 minutes** and queries users where `nextRolloverAt <= now`, so each person's day ends at their own midnight. For each of their habits that was not done on the day that just ended: if `freezesAvailable > 0` and exactly one day was missed, spend a freeze (decrement, write `freezeUses`) and keep the streak; otherwise set `currentStreak` to 0. Then move `nextRolloverAt` to the next local midnight. This makes the job idempotent: running it twice changes nothing the second time. Put the logic in an exported `runRollover(now)` and keep the scheduler wrapper thin, so tests can pass in a fake clock. Process users in pages, and handle one user's failure without stopping the rest.
9. **Reminders by push notification** (last phase), using Firebase Cloud Messaging web push. No email and no domain. Callables `registerPushToken({ token })` and `removePushToken({ token })` save and remove tokens for the signed-in user. A scheduled function runs every 15 minutes, finds users with `reminderEnabled` whose local time has passed `reminderTime`, who have unchecked habits today and whose `lastReminderDate` is not today, then sends one notification ("3 habits left today. Keep your 12 day streak alive.") to each of their tokens with `sendEachForMulticast` and sets `lastReminderDate`. Delete tokens that FCM reports as unregistered or invalid. Same pattern as the rollover: exported `runReminders(now, sender)` with a thin wrapper, and a fake sender in tests.
10. Secrets and service accounts go in function config or environment, never in git or the browser. The Firebase web config and the FCM VAPID public key are not secret, but keep them in env vars.

## Habit schedules and milestones (added after the first release)

Design reference: `docs/design/schedules-milestones-prototype.html` (only these two features; read the rules in its top comment).

**Schedules.**
- `days` lists the weekdays a habit is due: 1 to 7 unique numbers, 0 = Monday to 6 = Sunday. A habit without `days` is due every day, so habits from before schedules need no migration.
- The weekday always comes from the user's own timezone and local date.
- A day that is not scheduled is a **rest day**. It cannot be checked in: `/api/check-in` answers 409 with code `NOT_SCHEDULED`. It never breaks a streak and never uses a freeze.
- Streaks count scheduled days only. A scheduled day is missed only if it ended with no check-in and no freeze.
- Clients choose `days` only when creating a habit. After that, `POST /api/update-habit-days { habitId, days }` stores the change as `nextDays` from `nextDaysFrom`, which is tomorrow in the user's timezone, so today's streak is judged by the days it started with.
- When that date arrives the change becomes `days`, and the old days are kept in `pastDays` (`{ until, days }`), so past days are always judged by the schedule that applied then.
- `scheduledOn(habit, date)` in `@streaks/core` is the single rule for check-in, rollover, catch-up, reminders and the UI (the app imports it from `@streaks/core/schedule`).

**Milestones.**
- Milestones are 3, 7, 14, 30, 60, 100 and 365 (`MILESTONES` in `@streaks/core`).
- A check-in earns every milestone up to the new streak that is not yet in `milestonesEarned`, and `/api/check-in` returns the highest as `milestoneReached` (else null). Only that value opens the celebration.
- The list never shrinks on a reset, so reaching 7 again later does not celebrate again.
- Undoing the check-in that earned a milestone removes it and restores the streak stats.
- Habits from before milestones are backfilled silently from `bestStreak` (every milestone at or below it), with no celebration.

**Rollover and reminders.**
- The rollover closes every day since `lastClosedDate` in order (at most a week back), skipping rest days.
- A freeze is spent on a missed scheduled day whose previous scheduled day was done.
- The reminders job counts only habits scheduled today, so a day where everything rests sends nothing.

**Rules.** Clients may set `days` (validated) and an empty `milestonesEarned` when creating a habit, and nothing else of these. `days` after creation, `nextDays`, `nextDaysFrom`, `pastDays`, `milestonesEarned` and the streak fields are server-only.

## Frontend behaviour

- Auth with email and password, with the validation messages shown in the prototype. Call `ensureProfile` after sign-in. Protected routes (a layout under `app/(app)/`) redirect to log in. The landing page is public.
- Today: subscribe to the habits and today's check-in documents so the screen stays in sync. Check-off is optimistic through the `checkIn` callable, rolling back with an error toast if it fails. Show the "at risk" state, the progress ring, the "This week" strip and the all-done celebration.
- Habits: add, edit through Firestore under the rules, remove through `deleteHabit`, with the colour picker and delete confirmation. A first-run empty state offers one-tap suggestions.
- Progress: pick a habit, show current and best streak and a month calendar with previous and next month. Read-only.
- Settings: profile, theme (light, dark, follow device, saved on the user doc), time zone through `updateTimezone`, reminders (turning the switch on asks for notification permission, only in response to that click, then registers the token through `registerPushToken`; turning it off calls `removePushToken`; show a clear message if the browser blocks notifications), streak freeze count, password reset email, log out, delete account through `deleteAccount`.
- Loading, empty and error states on every screen. Keyboard focus styles and proper labels on all inputs.

## How to work

Work in phases. **Stop after each phase, summarise what you did and how to verify it, and wait for me to say go.** Commit at the end of each phase with a clear message.

1. Repo setup, Firebase project config, emulators running, `firestore.rules`, and `ensureProfile`.
2. `computeStreaks`, `checkIn`, `undoCheckIn`, `deleteHabit`, with tests.
3. `runRollover`, freeze logic, `updateTimezone`, and the scheduled wrapper, with tests.
4. Frontend: auth, routing, landing page, app shell.
5. Frontend: Today, Habits, Progress, Settings, animations, wired to the emulators.
6. Push reminders (service worker `firebase-messaging-sw.js` served from the Next.js `public/` folder, which cannot read env vars, so pass the config another way; foreground message handling; token registration), `deleteAccount`, and a short deployment checklist for me (Blaze plan, budget alert, env config, deploy commands).

Tests (Vitest, `@firebase/rules-unit-testing` for rules, and the route handlers called in-process against the Auth and Firestore emulators). Each must fail if the rule were broken:
- User B cannot read, update or delete user A's documents, and cannot check in on A's habit.
- A client cannot write `checkIns`, `freezeUses`, or any stat or server-owned field.
- Checking in twice in one day leaves one document and does not error.
- `computeStreaks` cases: 0 days, today only, yesterday only (alive, at risk), a gap (reset), best streak kept after a reset, freeze bridging one missed day, month and year boundaries.
- Timezone case: the same instant is "today" in one timezone and "tomorrow" in another.
- `runReminders`: sends once per day, skips users with everything done, respects local time, and removes invalid tokens.
- `runRollover`: breaks a missed streak, spends a freeze once, leaves done habits alone, only touches users whose midnight has passed, and is safe to run twice.

Before you start, tell me anything in this brief that is ambiguous or that you disagree with, then begin phase 1.
