# Streaks

A habit tracker where streaks are computed and enforced on the server (Firebase).

- `functions/`: Cloud Functions (2nd gen, TypeScript) and all backend tests
- `firestore.rules`: security rules (default deny, field-level validation)
- `apps/web`: Next.js (App Router) frontend, deployed to Vercel
- `design/streaks-prototype.html`: visual and behavioural spec
- `docs/PROJECT_BRIEF.md`: the brief; `docs/DEPLOYMENT.md`: how to deploy

## Requirements

Node 22+, pnpm, Java 21+ (for the Firestore emulator), and the Firebase CLI (`npm i -g firebase-tools`).

## Local development

Everything runs against the Emulator Suite using the `demo-streaks` project ID. A `demo-` project
cannot reach any live Firebase resources, so nothing here touches a real project.

```sh
pnpm install
pnpm emulators          # builds functions, then starts Auth, Firestore, Functions and the UI at http://127.0.0.1:4000
pnpm dev:web            # in a second terminal: the app at http://localhost:3000
```

With no `NEXT_PUBLIC_FIREBASE_*` variables set, the web app connects to the emulators. See
`apps/web/.env.example`.

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

```sh
pnpm test                         # backend tests inside `firebase emulators:exec`, then web unit tests
pnpm --filter functions test:unit # pure unit tests only, no emulators
```

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
