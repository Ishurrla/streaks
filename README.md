# Streaks

A habit tracker where streaks are computed and enforced on the server (Firebase).

- `functions/`: Cloud Functions (2nd gen, TypeScript) and all backend tests
- `firestore.rules`: security rules (default deny, field-level validation)
- `apps/web`: Next.js (App Router) frontend, deployed to Vercel
- `design/streaks-prototype.html`: visual and behavioural spec

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

The Functions emulator does not fire scheduled functions. To run the nightly rollover by hand
while the emulators are up (optionally with a fake clock):

```sh
pnpm --filter functions rollover:dev
pnpm --filter functions rollover:dev 2026-10-29T23:05:00Z
```

## Tests

```sh
pnpm test                         # backend tests inside `firebase emulators:exec`, then web unit tests
pnpm --filter functions test:unit # pure unit tests only, no emulators
```
