# Deploying Streaks (Spark plan)

Firebase (free Spark plan) provides Auth, Firestore and Cloud Messaging. Vercel hosts the Next.js
app and its `/api` routes, which hold all the server logic. GitHub Actions calls the two cron
endpoints every 15 minutes. Nothing here needs Cloud Functions, Cloud Scheduler or billing.

Do the steps in order and check each one before moving on. The project is `streaks-b1dca`, aliased
`prod` in `.firebaserc`. Run commands from the repo root. `pnpm exec firebase` uses the CLI version
pinned in this repo; sign it in once with `pnpm exec firebase login`.

## 1. Create the Firestore database in europe-west3 (Frankfurt), before anything else

The location cannot be changed later, and it matches the Vercel region (`fra1` in `apps/web/vercel.json`).

1. Firebase console > Build > **Firestore Database** > Create database.
2. If asked for an edition, pick **Standard**. Location: **europe-west3 (Frankfurt)**.
3. Start in **production mode** (deny all). Step 2 replaces those rules.

**Check:**

```sh
pnpm exec firebase firestore:databases:get "(default)" --project prod
```

The table shows `Location` as `europe-west3`. In the console the Data tab is empty.

## 2. Deploy the rules and indexes

```sh
pnpm exec firebase deploy --only firestore:rules,firestore:indexes --project prod
```

It ends with "Deploy complete!" after "rules file firestore.rules compiled successfully" and
"released rules". If it asks to delete indexes that are not in the file, answer **No** (a new
database has none).

**Check:**
- Firestore Database > **Rules**: starts with `rules_version = '2';` and the comment "Everything is
  denied unless a rule below allows it", published a minute ago.
- Firestore Database > **Indexes** > the single-field (exemptions) tab: one override on collection
  `pushTokens`, field `token`, ascending, for "Collection" and "Collection group". It may say
  "Building" for a few minutes before "Enabled". The composite tab stays empty.
- Optional: Rules > **Rules Playground**, simulate an unauthenticated `get` on `/users/test`: denied.

## 3. Create the service account key and split it into three values

The server uses the Firebase Admin SDK with this key. It is a real secret: it never goes in git, in a
`NEXT_PUBLIC_` variable, or anywhere in the browser.

1. Firebase console > Project settings > **Service accounts** > Firebase Admin SDK >
   **Generate new private key**. A JSON file downloads. (You rotated a key earlier and keep it in
   `apps/web/.env.local` as `FIREBASE_SERVICE_ACCOUNT`; you can take the three fields from that JSON
   instead of generating another.)
2. From the JSON, keep three fields for step 4:

   | JSON field | Vercel variable |
   | --- | --- |
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

   For `private_key`, copy everything from `-----BEGIN PRIVATE KEY-----` to
   `-----END PRIVATE KEY-----\n`, without the surrounding quotes. Leave the `\n` sequences as they are;
   the server turns them back into newlines.
3. Delete the downloaded file once the values are in Vercel. Local development does not use the key
   at all, so you can also remove `FIREBASE_SERVICE_ACCOUNT` from `apps/web/.env.local`.

**Check:** Google Cloud console > IAM & Admin > **Service accounts** >
`firebase-adminsdk-…@streaks-b1dca.iam.gserviceaccount.com` > **Keys**: only the keys you mean to
have are active (the old one you deleted is gone). `client_email` ends in `@streaks-b1dca.iam.gserviceaccount.com`
and `project_id` is `streaks-b1dca`.

## 4. Set the env vars on Vercel and the GitHub secrets

**4a. Push the repo to GitHub.** Use a **public** repository: GitHub Actions minutes are unlimited
there. A private repo gets 2,000 minutes a month on the free plan, and a run every 15 minutes uses about
2,900. Nothing secret is in git: env files are ignored, and secrets live only in Vercel and GitHub.

```sh
gh repo create streaks --public --source=. --remote=origin --push
```

Then see whether GitHub registered `.github/workflows/cron.yml`:

```sh
gh workflow list --all
```

- If **cron** is listed, its schedule has started and would fail until the app is deployed. Turn it
  off straight away: GitHub > **Actions** > **cron** > "…" menu > **Disable workflow**.
- If nothing is listed, GitHub missed the workflow in the repo's first push. This has happened here,
  and nothing runs until it is registered. Leave it for now; step 7 fixes it.

**4b. Make a cron secret.** Any long random string; for example:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use a different value from the `CRON_SECRET` in your local `.env.local`.

**4c. Create the Vercel project, without deploying yet.** Vercel > Add New > Project > import the
repository.
- **Root Directory**: `apps/web`. Vercel detects Next.js and the pnpm workspace, and reads
  `apps/web/vercel.json` (functions run in `fra1`, Frankfurt).
- The project name decides the domain: `<project-name>.vercel.app`, for example
  `https://streaks.vercel.app`. That is your `APP_URL` below.
- **Node.js version**: nothing to set. `engines` in `apps/web/package.json` asks for `22.x`, which
  overrides the Node.js Version setting in the dashboard.
- Open **Environment Variables** on the import screen and add these for **Production**. Do not press
  Deploy yet.

| Variable | Value | Sensitive |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | web config `apiKey` | |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `streaks-b1dca.firebaseapp.com` | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `streaks-b1dca` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | web config `appId` | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | web config `messagingSenderId` | |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Cloud Messaging > Web Push certificates, public key | |
| `FIREBASE_PROJECT_ID` | from step 3 | |
| `FIREBASE_CLIENT_EMAIL` | from step 3 | |
| `FIREBASE_PRIVATE_KEY` | from step 3 | yes |
| `CRON_SECRET` | from 4b | yes |
| `APP_URL` | `https://<project-name>.vercel.app`, no trailing slash | |

The six `NEXT_PUBLIC_*` values are the ones in your `apps/web/.env.local`, or print them with
`pnpm exec firebase apps:sdkconfig WEB --project prod`. Do **not** add
`NEXT_PUBLIC_FIREBASE_USE_EMULATORS` or any `*_EMULATOR_HOST`: the server refuses to start on Vercel
in emulator mode. Leave Preview empty unless you want preview deployments to use the real project;
without these values a preview refuses to start rather than misbehave.

**4d. GitHub secrets.** GitHub > Settings > Secrets and variables > **Actions** > New repository secret:
- `APP_URL`: the same value as in Vercel.
- `CRON_SECRET`: the same value as in Vercel.

**Check:**
- Vercel lists the 11 variables, all for Production, none of the emulator ones.
- GitHub > Settings > Secrets and variables > Actions lists `APP_URL` and `CRON_SECRET`.
- `gh workflow list --all` shows **cron** as disabled, or shows nothing (see 4a).
- `git ls-files | grep -i env` shows only `apps/web/.env.example`.

## 5. Add the Vercel domain to Firebase Auth

1. Firebase console > Build > **Authentication** > Settings > **Authorized domains** > Add domain:
   `<project-name>.vercel.app` (no `https://`). Add your custom domain too if you have one.
2. Same page, **Sign-in method**: make sure **Email/Password** is enabled.
   
**Check:** the list holds `localhost`, `streaks-b1dca.firebaseapp.com`, `streaks-b1dca.web.app` and
your Vercel domain; Sign-in method shows Email/Password as Enabled.

## 6. First deploy

Press **Deploy** on the Vercel import screen (later deploys happen on every push to `master`).

**Check:**
- The build log shows Node 22, says "Compiled successfully" and lists the routes, including eleven
  dynamic (`ƒ`) ones under `/api/`.
- Settings > Domains shows the domain you expected. If Vercel picked a different one, update
  `APP_URL` in Vercel and in GitHub, add it to the authorized domains (step 5), then Redeploy.
- Open the site and sign up. Today greets you by name. In the browser's network tab,
  `POST /api/ensure-profile` returned 200.
- Firestore > Data: `users/{uid}` exists with `timezone`, `nextRolloverAt`, `lastClosedDate` and
  `nextReminderAt: null`.
- Add a habit and check it off: `POST /api/check-in` returns 200, and
  `users/{uid}/habits/{id}/checkIns/<today>` exists.
- Vercel > Logs: no errors. In particular none saying "Refusing to use the Firebase emulators" or
  "… is not set" (a missing or misspelled variable; fix it and Redeploy, since env changes only apply
  to new deployments).
- If the logs show `ERR_REQUIRE_ESM` with `jwks-rsa` and `jose`, the `jwks-rsa` override in
  `pnpm-workspace.yaml` is not in effect. Vercel functions have failed this way on Node 22 with
  `jwks-rsa` 4, whose `jose` 6 is ES-module-only, so changing the Node version did not help. Check that
  the override and `pnpm-lock.yaml` are both pushed.
- The routes refuse strangers (both should print `401`):

  ```sh
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<project-name>.vercel.app/api/check-in
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<project-name>.vercel.app/api/cron/rollover
  ```

## 7. Run the cron workflow by hand

First get the workflow active. Either of these starts its 15-minute schedule:

- If **cron** is listed as disabled: GitHub > **Actions** > **cron** > **Enable workflow**.
- If nothing is listed: commit any change to `.github/workflows/cron.yml`, even to a comment, and push
  it to `master`. That also redeploys the app. `gh workflow list --all` should then show **cron** as
  active.

Then **Run workflow** (branch `master`).

**Check:**
- Both steps are green. The Rollover step prints `{"ok":true,"rolledOver":…,"skipped":…,"failed":…,"done":true}`
  and the Reminders step `{"ok":true,"sent":…,"skipped":…,"failed":…,"done":true}`. All zeros is normal
  when nothing is due.
- Firestore > Data: `cron/rollover` and `cron/reminders` exist, with `lastSuccessfulRun` a minute ago
  and `lastResult` matching the output.
- Over the next hour scheduled runs appear in the Actions tab (GitHub often starts them late) and
  `lastSuccessfulRun` keeps moving.
- A step that fails with `401` means `CRON_SECRET` differs between GitHub and Vercel (after changing
  it in Vercel, Redeploy). A `404` or connection error means `APP_URL` is wrong.

## After deploying

- Try a real reminder on a phone: README > "Testing notifications", level 3.
- After your local midnight, `lastClosedDate` on your `users/{uid}` document should move forward. That
  is the first real rollover.
- When updating `firebase-admin`, try removing the `jwks-rsa` override in `pnpm-workspace.yaml`. Recheck
  it before verifying App Check or phone number tokens with the Admin SDK, which do use `jwks-rsa`.
- Watch the cron: README > "Cron" explains `lastSuccessfulRun`. GitHub turns scheduled workflows off
  after 60 days without repo activity; re-enable it in the Actions tab if that happens.
- Spark quotas are 50,000 document reads and 20,000 writes a day (Firebase console > Usage). The
  cron reads only users who are due, and records 2 small documents per run (about 200 writes a day).
- Optional hardening: restrict the browser API key to your domains (Google Cloud console > APIs &
  Services > Credentials), and turn on Firebase App Check.
