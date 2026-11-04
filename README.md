# Streaks

A habit tracker where streaks are computed and enforced on the server. Firebase (Spark plan) provides
Auth, Firestore and Cloud Messaging; the server logic runs in Next.js route handlers on Vercel.

- `apps/web`: the Next.js (App Router) app, including the `/api` routes, deployed to Vercel
- `packages/core` (`@streaks/core`): the server logic the routes call (streaks, check-ins, rollover,
  reminders, accounts), its tests, and the Firestore rules tests
- `firestore.rules`, `firestore.indexes.json`: security rules (default deny, field-level validation)
- `.github/workflows/cron.yml`: calls the two cron endpoints every 15 minutes
- `docs/PROJECT_BRIEF.md`: the brief; `docs/DEPLOYMENT.md`: how to deploy

## Requirements

Node 22.12+, pnpm and Java 21+ (for the Firestore emulator). The Firebase CLI is a dev dependency, so
`pnpm install` brings the right version (`pnpm exec firebase ...`).

## Running locally

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the Auth and Firestore emulators (with the Emulator UI at http://127.0.0.1:4000)
and the app at http://localhost:3000, in one terminal. The app's `/api` routes use the same emulators
through the Admin SDK. Press Ctrl+C once to stop both: the emulators save their data to
`.emulator-data/` first and load it on the next start, so your test users and habits survive restarts.
Wait for "Export complete" before closing the terminal. Press Ctrl+C twice to stop without saving.
Delete `.emulator-data/` to start from empty.

Everything local runs under the `demo-streaks` project ID, which cannot reach any live Firebase
resource, and needs no credentials. Which project the app uses is decided by `apps/web/.env.local`
(see `apps/web/.env.example`):

| `apps/web/.env.local` | Browser and `/api` routes use | Push uses |
| --- | --- | --- |
| none (the default) | the emulators | a stand-in token ("Local mode") |
| real config + `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true` | the emulators | the real project's FCM |
| real config, no flag (what Vercel uses) | the real project | the real project's FCM |

In development the app shows a banner when the Auth or Firestore emulator is not running. If sign-up
fails with "Could not reach the Auth emulator", start `pnpm dev` (not `pnpm dev:web` on its own). If a
port is taken (9099, 8080, 4000 or 3000), stop whatever holds it and run `pnpm dev` again.

Helpers, with `pnpm dev` running:

```sh
pnpm seed:dev ada@example.com   # give an existing user 45 days of habit history
pnpm cron:dev                   # run both cron jobs now (see "Cron")
```

To run the two halves separately: `pnpm emulators` (no saved data) and `pnpm dev:web`.

**Google sign-in locally** needs no Google credentials. On the emulators, the Google button opens the
Auth emulator's own window: choose "Add new account", then "Auto-generate user information" or fill
in a name and email. Settings > Sign-in methods and deleting a Google-only account use the same window.

### Troubleshooting: Local dev: styles or new components missing

- **Symptom:** after pulling or switching branches, `pnpm dev` shows no styles, or a new component
  (like the theme switch) is invisible or 0x0, even though the code is right and the live site is fine.
- **Cause:** Turbopack's on-disk cache can go stale and serve old compiled output.
- **Fix:** stop the dev server, delete `apps/web/.next`, then run `pnpm dev` again.
- **Note:** `apps/web/next.config.ts` already turns off the Turbopack file-system cache for dev and
  build (`turbopackFileSystemCacheForDev` and `turbopackFileSystemCacheForBuild` set to `false`) to
  prevent this. If dev feels slow, those two flags can be set back to `true`, but then use the fix
  above whenever styles look wrong.

## How the server works

Every write the rules do not allow from the browser goes through a `POST /api/...` route:
`check-in`, `undo-check-in`, `ensure-profile`, `delete-habit`, `update-habit-days`, `update-timezone`,
`register-push-token`, `remove-push-token`, `sync-reminders` and `delete-account`.

- The browser sends its Firebase ID token as `Authorization: Bearer <token>` (`callApi` in
  `apps/web/src/lib/api.ts`). Each route verifies it with the Admin SDK and takes the user only from
  the verified token, never from the body or URL.
- Errors are `{ "error": { "code", "message" } }` with 400 (bad input), 401 (no or bad token),
  403 (closed account, or a sign-in too old to delete the account), 404 (not yours or not found) or
  409 (no profile yet, a day that has closed, or `NOT_SCHEDULED`: a check-in on a rest day).
- The server never trusts a date from the client: it works out "today" from the user's timezone.
- The Admin SDK is set up from `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
  `FIREBASE_PRIVATE_KEY` in production, and uses the emulators locally. It refuses to start on the
  emulators in any Vercel deployment.

## Data model and rules

Firestore, all under `users/{uid}` (`docs/PROJECT_BRIEF.md` has the full list):

| Document | Client may write | Server-only |
| --- | --- | --- |
| `users/{uid}` | `name`, `reminderEnabled`, `reminderTime`, `theme` | `timezone`, `freezesAvailable`, `nextRolloverAt`, `lastClosedDate`, `lastReminderDate`, `nextReminderAt` |
| `habits/{id}` | create with `name`, `color`, zeroed stats, optional `days`, optional empty `milestonesEarned`; then only `name` and `color` | `currentStreak`, `bestStreak`, `lastCheckInDate`, `milestonesEarned`, `days` after creation, `nextDays`, `nextDaysFrom`, `pastDays` |
| `habits/{id}/checkIns/{date}`, `freezeUses/{date}` | nothing | everything (`checkIns` also hold `milestonesAdded`) |
| `pushTokens/{id}` | nothing (not even read) | everything |

**Schedules.**
- `days` holds the weekdays a habit is due, 0 = Monday to 6 = Sunday, 1 to 7 of them. Missing means every day.
- Any other day is a rest day: no check-in (409 `NOT_SCHEDULED`), and it never breaks the streak or uses a freeze.
- Streaks count scheduled days only; for those habits the app says "N in a row" rather than "N day streak".
- `POST /api/update-habit-days { habitId, days }` changes the days from tomorrow in the user's timezone. It stores `nextDays` and `nextDaysFrom`.
- The rollover (or the next check-in) makes the change current and keeps the old days in `pastDays`, so past days keep the schedule they had.
- One function, `scheduledOn(habit, date)` in `packages/core/src/schedule.ts`, decides this everywhere. That covers check-in, rollover and catch-up, reminders, and the app through `@streaks/core/schedule`.

**Milestones.**
- Milestones are 3, 7, 14, 30, 60, 100 and 365.
- A check-in that first reaches one adds it to `milestonesEarned`, and `/api/check-in` returns it as `milestoneReached`. Undoing that check-in takes it back.
- Habits from before milestones get theirs filled in from `bestStreak` on the next rollover or check-in, with no celebration.

## Cron

Two jobs run every 15 minutes, called by `.github/workflows/cron.yml` (GitHub Actions) with
`Authorization: Bearer <CRON_SECRET>`:

- `POST /api/cron/rollover` closes the day for everyone whose local midnight has passed.
- `POST /api/cron/reminders` sends push reminders to users whose `nextReminderAt` has passed.

A missing or wrong secret gets 401 (compared in constant time). Both jobs are idempotent, stop
starting new pages after about 7 seconds, and leave anything unfinished for the next run. The app also
catches up on its own: every app start (`ensure-profile`) and every check-in rolls that user over if
the cron is late, so streaks are right whenever people open the app.

Schedules and milestones did not change the cron: same two endpoints, same `CRON_SECRET`, same
15-minute schedule. Rest days are handled inside the jobs: the rollover skips them and the reminders
job only counts habits due today.

**Is the cron running?** After each completed run the endpoint writes `cron/rollover` and
`cron/reminders` in Firestore with `lastSuccessfulRun`, `lastResult` and `lastDurationMs`. Look at
them in the Firebase console (Firestore Database > `cron`). If `lastSuccessfulRun` is more than about
an hour old, the GitHub schedule has stalled: check the repo's Actions tab. GitHub delays scheduled
runs under load, and turns schedules off after 60 days without activity in the repo; re-enable the
workflow there, or start a run by hand with "Run workflow".

Locally, with `pnpm dev` running and any `CRON_SECRET` in `apps/web/.env.local`:

```sh
pnpm cron:dev              # both jobs
pnpm cron:dev rollover     # or one of them
```

With the emulators, reminders are logged in the `web` output instead of being sent.

## Tests

```sh
pnpm test          # everything: core, rules and route tests under the emulators, then web unit tests
```

The server tests run inside `firebase emulators:exec` with their own Auth and Firestore emulators on
separate ports (`firebase.test.json`: 9199 and 8180, no UI) under their own project ID,
`demo-streaks-test`. You do not need to start anything first, it can run while `pnpm dev` is up, and it
never touches your dev data (nor stops `pnpm dev` from saving it on exit).

| Area | File | Emulators |
| --- | --- | --- |
| Streak logic (`computeStreaks`) | `packages/core/test/unit/streaks.test.ts` | no |
| Schedules, rest days, day changes, milestones | `packages/core/test/unit/habit-schedule.test.ts` | no |
| Rest days and milestones in check-in, undo and rollover | `packages/core/test/schedules.test.ts` | yes |
| Local dates, timezones, reminder schedule | `packages/core/test/unit/{time,schedule}.test.ts` | no |
| Firestore security rules | `packages/core/test/rules.test.ts` | yes |
| Check-ins and undo | `packages/core/test/checkins.test.ts` | yes |
| Rollover, freezes, time budget | `packages/core/test/rollover.test.ts` | yes |
| Timezone changes | `packages/core/test/timezone.test.ts` | yes |
| Reminders (fake push sender) | `packages/core/test/reminders.test.ts` | yes |
| Deleting habits and accounts | `packages/core/test/{habits,account}.test.ts` | yes |
| Every `/api` route: tokens, input, other users, catch-up | `apps/web/test/routes/*.test.ts` | yes |
| Cron endpoints: secret, both jobs | `apps/web/test/routes/cron.test.ts` | yes |
| Google sign-in, linking, set password, delete (real client SDK, no popup) | `apps/web/test/routes/google-account.test.ts` | yes |
| Web date, form, theme and emulator-check helpers | `apps/web/src/lib/*.test.ts` | no |
| Theme switch, password field and day picker (jsdom) | `apps/web/src/components/**/*.test.tsx` | no |
| No sideways scroll at 360 to 1280px, light and dark (real browser) | `apps/web/e2e/layout.spec.ts` | `pnpm dev` |

The layout test is separate from `pnpm test` because it drives the running app. With `pnpm dev`
up, run `pnpm test:layout`. It signs up a throwaway user on the emulators and deletes it at the end,
uses your installed Chrome, and refuses to run against anything but localhost. Set
`LAYOUT_BASE_URL` to point it at another local server, such as `next start` on another port.

One part at a time:

```sh
pnpm test:server                          # core, rules and route tests, under the test emulators
pnpm --filter @streaks/core test:unit     # pure unit tests, no emulators, under a second
pnpm --filter web test                    # web unit tests, no emulators

# One file under the test emulators:
node scripts/firebase.mjs emulators:exec --config firebase.test.json --project demo-streaks-test --only auth,firestore "pnpm --filter @streaks/core exec vitest run test/rules.test.ts"
node scripts/firebase.mjs emulators:exec --config firebase.test.json --project demo-streaks-test --only auth,firestore "pnpm --filter web exec vitest run --config vitest.routes.config.ts test/routes/cron.test.ts"
```

Add `-t "part of a test name"` after the file to run one test.

Faster loop while working: keep the test emulators running in one terminal with
`pnpm emulators:test`, and run vitest directly in another. The tests refuse to run without the
emulator variables, so they can never touch a real project:

```sh
# bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199
pnpm --filter @streaks/core exec vitest run test/rules.test.ts
pnpm --filter web exec vitest run --config vitest.routes.config.ts test/routes/check-in.test.ts
```

```powershell
# PowerShell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180"; $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199"
pnpm --filter @streaks/core exec vitest run test/rules.test.ts
```

## Testing notifications

Push reminders use Firebase Cloud Messaging, which the emulators do not emulate. There are three levels.

### 1. Emulators only (no Firebase project)

1. `pnpm dev`, then sign up and add a habit or two.
2. Settings > Reminders: turn the switch on. The browser asks for permission. Without push config the
   app registers a stand-in token, and Settings says "Local mode".
3. Set "Remind me at" to a time that has already passed today.
4. `pnpm cron:dev reminders`: it reports `sent: 1`, and the `web` output logs the notification it would
   send ("2 habits left today. ..."). Run it again: `sent: 0`, because today's reminder has gone.
5. Check off every habit, or set the time later, and it does not send either.

This tests the whole flow except FCM delivery itself.

### 2. A real notification on this computer, before deploying

You need the Firebase project with a web app and a VAPID key (docs/DEPLOYMENT.md). Nothing has to be
deployed.

1. In `apps/web/.env.local`, set the six `NEXT_PUBLIC_FIREBASE_*` values plus
   `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true`. Auth, Firestore and the `/api` routes stay on the
   emulators, but push registers with the real project's FCM.
2. `pnpm dev`, sign in, turn reminders on in Settings and allow notifications. The browser console
   prints `[push] registered token ...`.
3. Firebase console > Messaging > New campaign > Notifications. Enter a title and text, click
   **Send test message**, paste the token, and press Test.
   - If the Streaks tab is in front, the message shows as a toast (foreground handling).
   - If the tab is in the background or minimised, the system notification appears.

(`pnpm cron:dev` still only logs here: on the emulators the server never sends through real FCM.)

### 3. A real device after deploying

1. Deploy (docs/DEPLOYMENT.md) and open the app on the device.
   - Android or desktop: use Chrome, Edge or Firefox.
   - iPhone or iPad (iOS 16.4 or later): open it in Safari, tap Share > **Add to Home Screen**, and
     open Streaks from the Home Screen icon. iOS only allows web push for Home Screen apps.
2. Sign in, add a habit, and turn on reminders in Settings. Allow notifications.
3. Set "Remind me at" to a few minutes from now and leave a habit unchecked.
4. Wait for the next scheduled run, or GitHub > Actions > cron > **Run workflow**. Tapping the
   notification opens Today.
5. Each day sends at most one reminder. To test again the same day: in the Firestore console delete
   `lastReminderDate` on your `users/{uid}` document, then change "Remind me at" in Settings (which
   reschedules today's reminder) and run the workflow again.

If nothing arrives, check `cron/reminders.lastResult` in Firestore (`sent`, `skipped`, `failed`), the
function logs in Vercel (search for "Cron reminders finished"), and that `users/{uid}/pushTokens` has a
document.
