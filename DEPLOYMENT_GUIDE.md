# Getting Atomic Six online — step by step

This walks through everything from "empty folder" to "real website with Google
sign-in," in the order you'll actually do it. The starter files in this folder
(package.json, vite.config.js, src/firebase.js, etc.) are already set up —
you're mostly copying, clicking, and pasting.

---

## Step 1 — Get an account on the two places you'll need

- **GitHub** (github.com) — this is where your code lives and where the
  website gets hosted from. Free.
- **A Google account** — you'll use this to create the Firebase project.
  Firebase is Google's product, so this is the same login you already have.

---

## Step 2 — Create the GitHub repository

1. Go to github.com, click the **+** in the top right → **New repository**.
2. Name it something simple, e.g. `atomic-six`. **Remember this name exactly**
   — it has to match a setting in `vite.config.js` later.
3. Leave it Public. Don't add a README (we already have files ready).
4. Click **Create repository**. GitHub will show you a page with some
   commands — you don't need those yet, keep this tab open.

---

## Step 3 — Upload this starter folder to that repository

The simplest way, no command-line needed:

1. On your new repo's GitHub page, click **uploading an existing file**
   (or drag-and-drop).
2. Drag in **every file and folder** from this starter package — including
   the hidden `.github` folder (make sure your file browser shows hidden
   files, since folders starting with a dot are often hidden by default).
3. Commit the upload (green button, default message is fine).

If you're using **Claude Code** to help build the real game on top of this
starter (recommended — the next step is wiring in all the actual game code),
it can do this upload for you via git commands directly instead.

---

## Step 4 — Turn on GitHub Pages

1. In your repo, go to **Settings** → **Pages** (left sidebar).
2. Under "Build and deployment", set **Source** to **GitHub Actions**.
   (Not "Deploy from a branch" — we're using the automated workflow file
   already sitting in `.github/workflows/deploy.yml`.)
3. That's it for now — it'll actually deploy once there's real code to build,
   which happens automatically every time you push to the `main` branch.

---

## Step 5 — Create your Firebase project

1. Go to **console.firebase.google.com**, sign in with your Google account.
2. Click **Add project**. Name it (e.g. "Atomic Six"), click through the
   prompts (Google Analytics is optional, skip it if you want).
3. Once created, you'll land on the project's dashboard.

---

## Step 6 — Register a "web app" inside your Firebase project

Firebase projects can back multiple types of apps (iOS, Android, web) —
you want the web one.

1. On the project dashboard, click the **`</>`** (web) icon.
2. Give it a nickname (e.g. "atomic-six-web"). You don't need Firebase
   Hosting here since GitHub Pages is doing that job — you can leave that
   checkbox unchecked.
3. Firebase will show you a code block that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "atomic-six-xxxxx.firebaseapp.com",
     projectId: "atomic-six-xxxxx",
     ...
   };
   ```
   **Copy this whole object.**

---

## Step 7 — Paste your Firebase config into the code

1. In your GitHub repo (or your local copy), open **`src/firebase.js`**.
2. Find the `firebaseConfig` object near the top — it currently has
   placeholder text like `"PASTE_YOUR_API_KEY_HERE"`.
3. Replace the whole object with the real one you copied from Firebase.
4. Save, and commit/push that change back to GitHub.

This file being public is fine — Firebase config values aren't secret keys,
your actual security comes from Firestore rules (Step 10) and Auth, not from
hiding this.

---

## Step 8 — Turn on Google sign-in

1. In the Firebase console, go to **Authentication** (left sidebar) →
   **Get started**.
2. Under **Sign-in method**, click **Google**, toggle it **Enable**, pick a
   support email, **Save**.

---

## Step 9 — Tell Firebase which domain is allowed to sign people in

This is the step that's easy to forget and causes sign-in to silently fail.

1. Still in **Authentication** → **Settings** tab → **Authorized domains**.
2. Add your live site's domain. If you're using plain GitHub Pages, that's
   `yourusername.github.io` (no `https://`, no trailing slash, no repo name).
   If you set up a custom domain later, add that too.

---

## Step 10 — Set up Firestore (the database)

1. In the Firebase console, go to **Firestore Database** → **Create database**.
2. Choose **Start in production mode** (not test mode — we already have
   real rules ready to paste in, see next step).
3. Pick a region close to you, click **Enable**.
4. Go to the **Rules** tab. Delete what's there and paste in the contents of
   **`firestore.rules`** from this starter package, then **Publish**.
   These are draft rules — good enough to start safely, but plan to revisit
   them once matchmaking and match documents take their final shape.

---

## Step 11 — Check it's actually live

1. Go back to your GitHub repo → **Actions** tab. You should see a workflow
   run (triggered automatically by your pushes). Wait for the green checkmark.
2. Go to **Settings** → **Pages** — it'll show you the live URL, something
   like `https://yourusername.github.io/atomic-six/`.
3. Open it. You should see "ATOMIC SIX" and a **Continue with Google**
   button. Click it — if a Google sign-in popup appears and lets you through,
   everything above worked.

---

## Where things stand after this

At this point you have: a live website, on your own GitHub-hosted URL, with
working Google sign-in, and a Firestore database ready to hold data. What's
**not** done yet is dropping the actual Atomic Six game into this shell and
connecting its matchmaking/game-state logic to Firestore instead of the old
artifact storage — that's real, substantial coding work best done with
Claude Code, since it involves iterating and testing locally with `npm run
dev` in a way I can't do from inside a chat conversation.

If you want, the next thing to prepare is a **Firestore data model** spec
(what collections/documents look like for users, decks, the matchmaking
queue, and live matches) — a clear blueprint to hand to Claude Code so it
knows exactly what to build.
