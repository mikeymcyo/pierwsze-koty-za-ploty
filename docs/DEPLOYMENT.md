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
2. Vercel detects Next.js on its own. Leave the build settings alone.
3. Before deploying, add the environment variables in step 6.

Vercel deploys your **default branch** (`main`) to Production and every other
branch to Preview. Since the app lives on `claude/siteboss-pro-planning-8y80n2`,
it will deploy as a Preview automatically — which is exactly what you want.

> `main` currently holds only the old static HTML pages, so the Production
> deployment will just serve those until Phase 1 is merged. That is expected.

## 6. Environment variables

**Settings → Environment Variables.** Add both of these, ticking **Preview**
(tick Production too if you plan to merge later):

| Name | Value |
| ---- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL from step 4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key from step 4 |

**Do not set `NEXT_PUBLIC_SITE_URL` for Preview.** Left unset, the app uses
Vercel's stable per-branch URL (`VERCEL_BRANCH_URL`) for the links in
confirmation and password-reset emails. Setting it to a fixed value would send
those emails to the wrong origin.

## 7. Get the preview deployed

If you added the environment variables during import, the first deployment
already used them. If you added them afterwards, they only apply to the *next*
build — go to **Deployments**, find the branch, and choose **⋯ → Redeploy**.
Pushing any new commit to the branch also triggers a fresh preview.

You will end up with two URLs:

- A **per-deployment** URL, unique to each build — changes every push.
- A **branch** URL like
  `siteboss-pro-git-claude-siteboss-pro-planning-8y80n2-<scope>.vercel.app` —
  stable for the life of the branch.

**Use the branch URL.** It is the one to open on your phone and the one to give
Supabase in the next step.

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
The environment variables are missing or were added after the last build.
Add them and redeploy.

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
