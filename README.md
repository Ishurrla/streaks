# Streaks

A habit tracker where streaks are computed and enforced on the server (Firebase).

- `functions/`: Cloud Functions (2nd gen, TypeScript) and all backend tests
- `firestore.rules`: security rules (default deny, field-level validation)
- `apps/web`: Next.js (App Router) frontend, deployed to Vercel
- `design/streaks-prototype.html`: visual and behavioural spec
- `docs/PROJECT_BRIEF.md`: the brief; `docs/DEPLOYMENT.md`: how to deploy

## Requirements

Node 22+, pnpm and Java 21+ (for the Firestore emulator). The Firebase CLI is a dev dependency, so
`pnpm install` brings the right version. A global `firebase` is only needed for deploying.

## Running locally

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the functions, then starts the Auth, Firestore and Functions emulators (with the
Emulator UI at http://127.0.0.1:4000) and the app at http://localhost:3000, in one terminal. Press
Ctrl+C once to stop both: the emulators save their data to `.emulator-data/` first and load it on the
next start, so your test users and habits survive restarts. Press Ctrl+C twice to stop without saving.
Delete `.emulator-data/` to start from empty.

Everything runs under the `demo-streaks` project ID. A `demo-` project cannot reach any live Firebase
resources, so nothing here touches a real project. With no `NEXT_PUBLIC_FIREBASE_*` variables (there
is no `.env.local` by default) the app uses that project and the emulators. See `apps/web/.env.example`.

In development the app checks the emulators and shows a banner when one is not running, or when the
Functions emulator is up but loaded no functions. If sign-up fails:

- "Could not reach the Auth emulator": the emulators are not running. Use `pnpm dev`, not `pnpm dev:web`.
- "We could not load your account" with `functions/internal`: the Functions emulator has no functions.
  Look for "Failed to load function definition" in its output and restart. `pnpm dev`, `pnpm emulators`
  and the tests allow the functions 60 seconds to load (`FUNCTIONS_DISCOVERY_TIMEOUT`); the Firebase
  CLI's default of 10 seconds is sometimes too short on Windows.
- Something else already using a port (9099, 8080, 5001, 4000 or 3000): stop it, or an old
  `pnpm dev:web`, and run `pnpm dev` again.

To run the two halves separately: `pnpm emulators` (no saved data) and `pnpm dev:web`.

The Functions emulator does not fire scheduled functions. To run the nightly rollover or the
reminders job by hand while the emulators are up (optionally with a fake clock):

```sh
pnpm --filter functions rollover:dev
pnpm --filter functions rollover:dev 2026-10-29T23:05:00Z
pnpm --filter functions reminders:dev
pnpm --filter functions reminders:dev 2026-10-28T19:30:00Z
```

To give an existing emulator user some habit history (streaks, an at-risk habit, a full calendar):

```sh
pnpm --filter functions seed:dev ada@example.com
```

If the dev server ever serves stale CSS after edits, stop it and delete `apps/web/.next`
(Next.js keeps a persistent dev cache there).

## Tests

Run everything from the repo root. You do not need to start the emulators first:
`firebase emulators:exec` starts Auth, Firestore and Functions, runs the tests, then shuts them down.
Stop `pnpm dev` (or `pnpm emulators`) before running it, or the ports clash.

```sh
pnpm test        # everything: builds functions, runs all backend tests under the emulators, then the web tests
```

| Area | File | Needs emulators |
| --- | --- | --- |
| Streak logic (`computeStreaks`) | `functions/test/unit/streaks.test.ts` | no |
| Local dates and timezones | `functions/test/unit/time.test.ts` | no |
| Firestore security rules | `functions/test/rules.test.ts` | yes |
| Check-ins and undo | `functions/test/checkins.test.ts` | yes |
| Profile creation | `functions/test/ensureProfile.test.ts` | yes |
| Rollover, freezes, timezone changes | `functions/test/rollover.test.ts` | yes |
| Reminders (fake push sender) | `functions/test/reminders.test.ts` | yes |
| Push tokens and account deletion | `functions/test/account.test.ts` | yes |
| Web date and form helpers | `apps/web/src/lib/*.test.ts` | no |

One part at a time:

```sh
pnpm --filter functions test:unit   # streak logic and time, no emulators, under a second
pnpm --filter functions test        # all backend tests, under the emulators
pnpm --filter web test              # web unit tests
pnpm test:server                    # @streaks/core and the /api route handlers, under the Auth and Firestore emulators
pnpm --filter @streaks/core test:unit   # streak logic and time, no emulators

# A single backend file under the emulators (run from functions/):
cd functions
pnpm run build
node ../scripts/firebase.mjs emulators:exec --project demo-streaks --only auth,firestore,functions "npx vitest run test/rules.test.ts"
```

Swap in `test/rollover.test.ts`, `test/reminders.test.ts` and so on. Add `-t "part of a test name"`
after the file to run one test.

Faster loop while working: keep `pnpm emulators` running in one terminal and run vitest directly in
another. Not `pnpm dev`: the tests empty the Firestore emulator, which would wipe your saved dev data.
The tests refuse to run without the emulator variables, so they can never touch a real project:

```sh
# bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx vitest run test/rules.test.ts
```

```powershell
# PowerShell
cd functions
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
npx vitest run test/rules.test.ts
```

The Functions emulator only reloads after `pnpm --filter functions build`, so rebuild after changing
code in `functions/src`.

If a run fails with "User code failed to load ... Timeout after 10000" or "No test files found",
the emulator started too slowly (usually a busy or just-woken machine). Run it again.

## Testing notifications

Push reminders use Firebase Cloud Messaging, which the Emulator Suite does not emulate. There are three levels.

### 1. Emulators only (no Firebase project)

1. `pnpm emulators` and `pnpm dev:web`, then sign up and add a habit or two.
2. Settings > Reminders: turn the switch on. The browser asks for permission. Without push config the app registers a stand-in token, and Settings says "Local mode".
3. Set "Remind me at" to a time that has already passed today.
4. `pnpm --filter functions reminders:dev` prints the notification it would send ("2 habits left today. ..."). Run it again: it skips you, because today's reminder has gone.
5. Check off every habit, or set the time later, and it skips you as well.

This tests the whole flow except FCM delivery itself.

### 2. A real notification on this computer, before deploying

You need a Firebase project with a web app and a VAPID key (docs/DEPLOYMENT.md, steps 1 and 2). Nothing has to be deployed.

1. Create `apps/web/.env.local` with the six `NEXT_PUBLIC_FIREBASE_*` values from docs/DEPLOYMENT.md, plus `NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true`. Auth, Firestore and Functions stay on the emulators, but push registers with the real project's FCM.
2. Create `functions/.env.<project-id>` with `APP_URL=http://localhost:3000`. Without it, the Functions emulator stops and waits for you to type a value.
3. Start the emulators under that project ID: `pnpm --filter functions build && firebase emulators:start --project <project-id>`. Then run `pnpm dev:web`.
4. Turn reminders on in Settings and allow notifications. The browser console prints `[push] registered token ...`.
5. Firebase console > Messaging > New campaign > Notifications. Enter a title and text, click **Send test message**, paste the token, and press Test.
   - If the Streaks tab is in front, the message shows as a toast (foreground handling).
   - If the tab is in the background or minimised, the system notification appears.

### 3. A real device after deploying

1. Deploy (docs/DEPLOYMENT.md) and open `<app-url>` on the device.
   - Android or desktop: use Chrome, Edge or Firefox.
   - iPhone or iPad (iOS 16.4 or later): open it in Safari, tap Share > **Add to Home Screen**, and open Streaks from the Home Screen icon. iOS only allows web push for Home Screen apps.
2. Sign in, add a habit, and turn on reminders in Settings. Allow notifications.
3. Set "Remind me at" to a few minutes from now and leave a habit unchecked.
4. Wait for the next 15-minute run, or Google Cloud console > Cloud Scheduler > `firebase-schedule-reminders-...` > **Force run**. Tapping the notification opens Today.
5. Each day sends at most one reminder. To test again the same day, delete the `lastReminderDate` value on your `users/{uid}` document in the Firestore console, then force another run.

If nothing arrives, check Functions > Logs for "Reminders finished" (it shows `sent`/`skipped`/`failed` counts), and confirm `users/{uid}/pushTokens` has a document.
