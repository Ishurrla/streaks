# Deploying Streaks

Firebase runs the backend (Auth, Firestore, Cloud Functions, Cloud Messaging) and Vercel hosts the Next.js app. Do the steps in order. `<project-id>` is your Firebase project ID and `<app-url>` is your Vercel URL, for example `https://streaks.vercel.app`.

## 1. Firebase project and billing

1. Create a project at https://console.firebase.google.com. Google Analytics is not needed.
2. Upgrade to the **Blaze** plan (Usage and billing > Modify plan). Scheduled functions need it.
3. Add a **budget alert**: Google Cloud console > Billing > Budgets & alerts > Create budget. Pick the project, set a small amount (for example 5 USD), and keep the 50%, 90% and 100% email alerts. A budget only alerts, it does not cap spending.

Expected cost at small scale is close to zero. The two scheduled jobs use 2 of the 3 free Cloud Scheduler jobs per billing account, and each runs 96 times a day.

## 2. Turn on the services

1. **Authentication** > Get started > Sign-in method > enable **Email/Password**.
   - Optional: Settings > Password policy > minimum length 8, so the server enforces the same rule as the app.
2. **Firestore Database** > Create database > **production mode**. Pick a location near the functions region (`europe-west1`), for example `eur3` or `europe-west1`. You cannot change the location later.
3. **Register a web app**: Project settings > General > Your apps > Web (`</>`). Skip Firebase Hosting. Keep the config values for step 5.
4. **Cloud Messaging VAPID key**: Project settings > Cloud Messaging > Web Push certificates > **Generate key pair**. Copy the public key.

## 3. Point the CLI at the project

```sh
firebase login
firebase use --add            # choose <project-id>, alias it "prod"
```

`demo-streaks` stays the default for local work, so deploys must name `--project prod`.

## 4. Function parameters

Create `functions/.env.<project-id>` (it is git-ignored) containing:

```
APP_URL=<app-url>
```

This is where a reminder notification opens when tapped. It is not a secret. No service account keys are needed: deployed functions use the project's default service account.

## 5. Vercel

1. Import the Git repository in Vercel and set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm.
2. Add these environment variables (Production and Preview). They are public client config, not secrets:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` from step 2.3 |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | public key from step 2.4 |

   Do not set `NEXT_PUBLIC_FIREBASE_USE_EMULATORS` in Vercel.
3. Deploy. If the final URL differs from what you put in `APP_URL`, update the env file and redeploy the functions (step 6).
4. In Firebase: Authentication > Settings > **Authorized domains** > add your Vercel domain.

## 6. Deploy the backend

From the repo root:

```sh
pnpm install
pnpm test                                                        # all green before deploying
firebase deploy --only firestore:rules,firestore:indexes --project prod
firebase deploy --only functions --project prod
```

The first functions deploy turns on the Cloud Functions, Cloud Build, Artifact Registry, Cloud Scheduler, Eventarc and Pub/Sub APIs, which can take a few minutes. If it fails while an API is still being enabled, run it again. The `predeploy` hook builds the TypeScript first.

Later updates use the same two commands. Use `firebase deploy --project prod` to deploy everything at once.

## 7. Check it works

1. Sign up on `<app-url>`, add a habit and check it off.
2. Firestore console: `users/{uid}/habits/{id}/checkIns/<today>` exists.
3. Google Cloud console > Cloud Scheduler: two jobs (`firebase-schedule-rollover-…` and `firebase-schedule-reminders-…`) run every 15 minutes. **Force run** triggers one straight away. Logs are under Functions > Logs.
4. Push: see "Testing notifications" in the README.

## Optional hardening

- Restrict the browser API key (Google Cloud console > APIs & Services > Credentials) to HTTP referrers on your Vercel domain and `localhost`.
- Turn on Firebase App Check for Firestore and Functions.
