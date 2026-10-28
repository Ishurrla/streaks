# Streaks

A habit tracker where streaks are computed and enforced on the server (Firebase).

- `functions/`: Cloud Functions (2nd gen, TypeScript) and all backend tests
- `firestore.rules`: security rules (default deny, field-level validation)
- `apps/web`: frontend (phase 4)
- `design/streaks-prototype.html`: visual and behavioural spec

## Requirements

Node 22+, pnpm, Java 21+ (for the Firestore emulator), and the Firebase CLI (`npm i -g firebase-tools`).

## Local development

Everything runs against the Emulator Suite using the `demo-streaks` project ID. A `demo-` project
cannot reach any live Firebase resources, so nothing here touches a real project.

```sh
pnpm install
pnpm emulators          # builds functions, then starts Auth, Firestore, Functions and the UI at http://127.0.0.1:4000
```

The Functions emulator does not fire scheduled functions. To run the nightly rollover by hand
while the emulators are up (optionally with a fake clock):

```sh
pnpm --filter functions rollover:dev
pnpm --filter functions rollover:dev 2026-10-29T23:05:00Z
```

## Tests

```sh
pnpm test                         # builds functions and runs every test inside `firebase emulators:exec`
pnpm --filter functions test:unit # pure unit tests only, no emulators
```
