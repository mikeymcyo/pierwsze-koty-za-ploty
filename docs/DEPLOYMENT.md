# Deploying a test build to Vercel

This walks through putting the current branch on a **Preview** deployment — a
shareable HTTPS URL you can open on a phone — while leaving production alone.

You need a Vercel account and a Supabase project. Both are free.

---

## Why a hosted Supabase project is required

`npm run setup:local` runs Supabase inside Docker on your own machine. That
instance is only reachable from that machine, so a deployed app cannot talk to
it. A deployment needs a hosted Supabase project.

Keep this one separate from anything real — it is a test database.

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
   Pick the region closest to you. Save the database password somewhere.
2. Wait for it to finish provisioning (a couple of minutes).

## 2. Apply the migrations

From the repository, with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The project ref is the string in your dashboard URL:
`https://supabase.com/dashboard/project/<project-ref>`.

Alternatively, open **SQL Editor** in the dashboard and paste the contents of
each file in `supabase/migrations/` in filename order, running them one at a
time:

1. `20260826000001_initial_schema.sql`
2. `20260826000002_rls_policies.sql`
3. `20260826000003_storage.sql`

To confirm it worked, open **Table Editor** — you should see ten tables, and
**Storage** should list the `site-photos` and `report-pdfs` buckets.

## 3. Turn off email confirmation (recommended for a test project)

**Authentication → Sign In / Providers → Email → Confirm email: off**

With it on, every test signup has to be confirmed through an email link. Off,
signup logs you straight in, which is much faster for testing on a phone. Turn
it back on before this database holds anything real.

## 4. Collect the two values you will need

**Project Settings → API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The anon key is designed to be public and is safe in a browser bundle. Row Level
Security is what protects the data. Do **not** use the `service_role` key here —
it bypasses RLS entirely and must never reach a browser.

---

## 5. Connect the repository to Vercel

1. https://vercel.com/new → import `mikeymcyo/pierwsze-koty-za-ploty`.
2. Add the environment variables in step 6 **before** the first build, if you
   can. They are baked into the build, not read at runtime — see step 7.

Vercel deploys your **default branch** (`main`) to Production and every other
branch to Preview. The app lives on `claude/siteboss-pro-planning-8y80n2`, so it
deploys as a Preview automatically — which is what you want.

### Check the Framework Preset

**Settings → Build and Deployment.** It must read:

| Setting | Value |
| ------- | ----- |
| Framework Preset | **Next.js** |
| Root Directory | **`./`** |

Vercel detects the framework at import time by looking at the default branch. If
`main` has no `package.json` at that moment, it guesses **Other** and builds the
repo as a static site: no `next build`, no serverless functions, and `proxy.ts`
never runs. The deployment still reports Ready, which makes this easy to miss.

Root Directory is `./` because `package.json` and `app/` sit at the repository
root.

> `main` currently contains no application at all, so Production builds **fail**,
> and any Production URL returns `404: NOT_FOUND`. That is expected until Phase 1
> is merged, and is unrelated to the Preview deployment. Do not diagnose Preview
> problems from a Production URL.

## 6. Environment variables

**Settings → Environments**, then pick the environment. Vercel moved these; there
is no longer a separate top-level "Environment Variables" item in Project
Settings.

Add both, to **Preview** and **Production**:

| Name | Value |
| ---- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL from step 4 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key from step 4 |

The app accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead, for older projects that
only issue a legacy anon key. Set one or the other, not both. Preview is what
serves this branch; Production is set now so a later merge does not break.

**Do not set `NEXT_PUBLIC_SITE_URL`.** Left unset, the app uses Vercel's stable
per-branch URL (`VERCEL_BRANCH_URL`) for the links in confirmation and
password-reset emails. Setting it to a fixed value would send those emails to
the wrong origin.

## 7. Get the preview deployed

**Environment variables are compiled into the build, not read at runtime.** Every
`NEXT_PUBLIC_*` reference is replaced with a literal value when `next build`
runs, so a build made before you saved them has `undefined` baked in permanently.
Changing the dashboard afterwards cannot fix an existing build, and the app will
keep showing "SiteBoss Pro is not connected to Supabase yet" no matter what the
settings now say.

If you added the variables after the first build, get a genuinely fresh one:

- **A new commit** is the reliable route. It always builds from scratch.
- **Deployments → ⋯ → Redeploy** also works, but you must **untick "Use existing
  Build Cache"**. It is ticked by default, and reusing the cache can reuse the
  compiled output with the old values still inlined.

Vercel labels a build whose project settings have changed since it ran as
**"Ready — Stale"**. That label is the signal that the running build predates
your framework-preset or environment-variable changes, and needs replacing.

You will end up with two kinds of URL:

- A **per-deployment** URL, unique to each build. It changes on every push, and
  URLs from superseded or failed builds return `404: NOT_FOUND`.
- A **branch** URL containing `-git-<branch-slug>-`, which always points at the
  newest successful build of that branch.

**Use the branch URL.** It is the one to open on your phone and the one to give
Supabase in the next step. To find it: Deployments → the row whose branch is
`claude/siteboss-pro-planning-8y80n2` **and** whose target is Preview → Visit.

## 8. Allow the URL in Supabase

**Authentication → URL Configuration**:

- **Site URL**: your branch URL, e.g.
  `https://siteboss-pro-git-claude-....vercel.app`
- **Redirect URLs**: add
  `https://siteboss-pro-git-claude-....vercel.app/auth/callback`

To cover every future preview in one go, a wildcard also works:

```
https://*.vercel.app/auth/callback
```

Convenient for a test project; narrow it before production.

Skipping this step is the single most common cause of "the link in the email
does nothing" — Supabase silently refuses to redirect anywhere not on this list.

## 9. Check preview protection before reaching for your phone

**Settings → Deployment Protection.** If **Vercel Authentication** is enabled,
preview URLs demand a Vercel login, and your iPhone will hit a login wall rather
than the app.

Either turn it off for previews on this test project, or use **⋯ → Share** on
the deployment to generate a bypass link.

---

## Testing on the iPhone

Open the branch URL in Safari. Worth trying:

- Sign up, sign out, sign back in.
- The bottom navigation — every tab should be comfortable one-handed.
- **Share → Add to Home Screen** to run it fullscreen, without Safari's chrome.
  This is how a site manager would actually use it.
- Rotate to landscape; the layout should hold.

Not there yet, by design: creating projects (Phase 2), dictation (Phase 3) and
camera capture (Phase 4). Phase 1 is authentication, navigation and the shell.

One thing to know for later: iOS Safari does not implement the Web Speech API,
so on iPhone the dictation button in Phase 3 will fall back to the keyboard's
own microphone, which types into the same field and works fine.

---

## Troubleshooting

**Every route bounces to the landing page with a setup notice.**
The environment variables are missing, or — far more often — they were added
*after* the build that is currently serving. They are inlined at build time, so
the running artifact still has `undefined` compiled in. Get a fresh build: a new
commit, or Redeploy with "Use existing Build Cache" unticked. See step 7.

**"Ready — Stale" next to the deployment.**
The build predates a change to project settings, typically the framework preset
or the environment variables. It keeps serving, but it is not built from your
current settings. Replace it with a fresh build.

**A deployment URL returns `404: NOT_FOUND` while the branch URL works.**
Per-deployment URLs are pinned to one build; superseded and failed builds return
404. This is normal and is not a fault in the app. Use the branch URL. If the
404 URL was a Production one, it is `main` failing to build, which is expected
until Phase 1 merges.

**The page loads for you but the app looks unauthenticated to everyone else.**
Deployment Protection passes transparently in a browser already signed in to
Vercel, so the owner sees the app while a phone or an automated check sees the
login wall. Always confirm in a private window — see step 9.

**"Could not load your dashboard" or a permission error.**
The migrations have not been applied to this project. Redo step 2 — in
particular `20260826000002_rls_policies.sql`, which contains the table grants.

**Signup succeeds but nothing arrives, or the email link fails.**
Either email confirmation is on and the redirect URL is not allow-listed
(steps 3 and 8), or `NEXT_PUBLIC_SITE_URL` is set to the wrong origin (step 6).

**The phone asks for a Vercel login.**
Deployment Protection — see step 9.

**The build fails on Vercel.**
It should not; `npm run build` passes on this branch. Read the build log —
a missing environment variable at build time is the usual cause.
