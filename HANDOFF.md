# SiteBoss Pro - Handoff

For a Claude Code session with no prior context. Every claim here was checked
against the repository or by running something. Where something is unverified,
it says so explicitly - treat that distinction as load-bearing.

**Written:** 2026-08-26 · **Branch head at writing:** `b06b878`

**Updated:** 2026-08-27 - section 9 rewritten with a reproduced diagnosis; new
`lib/env.ts` bug in section 12; section 13 re-ordered. No application code has
been changed.

> `PROJECT_STATE.md` in this repo is an earlier handoff. Where the two disagree,
> **this file wins** - it is newer. Consider deleting PROJECT_STATE.md once you
> have read both.

---

## 1. Product vision and MVP

Mobile-first construction site reporting for site managers, supervisors and
subcontractors. The entire product exists to serve one workflow:

> Stand on site, take ~10 photos, speak for ~60 seconds about the day's work,
> and get a professional, client-ready PDF report with almost no typing.

It is deliberately **not** a construction ERP. If a feature does not make that
one workflow faster, it does not belong in the MVP.

The MVP is seven phases: foundation/auth, projects, report capture, photos, AI
report generation, issues + PDF, polish. Phases 1 and 2 are done.

The repo owner is a **site manager, not a developer**. Explain plainly, never
assume they will debug for you, and never leave a button that does not work.

---

## 2. Architecture and stack

Verified in `package.json`:

| Concern | Choice |
| ------- | ------ |
| Framework | Next.js **16.3.3**, App Router, Turbopack |
| React | 19.2.8 |
| Language | TypeScript, strict |
| Styling | Tailwind CSS **v4**, `@theme` tokens in `app/globals.css` (no tailwind.config) |
| UI | Hand-written shadcn/ui-style primitives + Radix slot/label + lucide-react |
| Backend | Supabase (Postgres, Auth, Storage) via `@supabase/ssr` 0.12.5 |
| Validation | zod 4 |
| Tests | Playwright 1.56.1 (pinned) + psql-driven SQL tests |
| Hosting | Vercel (Preview only; nothing merged to main) |

Not yet installed, needed later: OpenAI SDK (Phase 5), `@react-pdf/renderer`
(Phase 6).

**Route protection lives in `proxy.ts` at the repo root.** Next.js 16 deprecates
`middleware.ts`; having both is a hard build error.

---

## 3. Repository and branch

- Repo: `mikeymcyo/pierwsze-koty-za-ploty` - **public**
- **Branches - read this before pushing.** The original instruction was *only
  ever push to* `claude/siteboss-pro-planning-8y80n2`. The 2026-08-27 session
  was started by the harness on a second branch,
  `claude/siteboss-pro-react-441-diagnosis-bhvwk8`, and this handoff update was
  pushed there, deliberately: it leaves PR #1 and the planning branch untouched.
  Both branches were identical at `046c11a` when it forked. **Ask the owner
  which branch the #441 fix should land on** rather than assuming; cherry-picking
  between them is trivial while they have not diverged.
- Base: `main`. **`main` is completely empty** - the owner deleted the four
  legacy static files. Production builds therefore **fail**, and any Production
  URL returns `404: NOT_FOUND`. Expected; do not "fix" it.
- **PR #1** is open and must **not** be merged yet (owner's instruction).
- **No CI exists.** No `.github/workflows/`. Nothing runs the test suites
  automatically. Adding one has been offered twice and not yet requested.

Run `git log --oneline` for current history rather than trusting a copy here.

---

## 4. What Phase 1 and Phase 2 contain

**Phase 1** - foundation, database, auth, app shell:
sign up / in / out / password reset as zod-validated server actions; the full
10-table schema with RLS; `proxy.ts` session refresh and route gating; the
mobile-first shell (bottom nav with raised centre action, desktop sidebar);
dashboard, projects, reports and profile pages reading real data; a light-only
high-contrast theme; the UI primitive set.

**Phase 2** - projects:
`app/(app)/projects/actions.ts` (create/update/delete, zod-validated); a shared
`ProjectForm` covering every schema column; `/projects/[id]` with **Overview /
Reports / Photos / Open Issues** tabs driven by `?tab=` so they survive a reload
and can be shared; `/projects/[id]/edit`; project cards linking through from the
dashboard and list.

Deliberately absent: a **"New report" button** on the project page. The capture
screen is Phase 3 and a button that only explains itself is not worth having.
Restore it in Phase 3.

---

## 5. Supabase: schema, RLS, storage

Four migrations in `supabase/migrations/`, which are **the source of truth**:

```
20260826000001_initial_schema.sql
20260826000002_rls_policies.sql
20260826000003_storage.sql
20260826000004_revoke_anon.sql
```

`supabase/apply-all-migrations.sql` is a **generated** single-paste file for the
Supabase SQL Editor. Regenerate with `./scripts/build-combined-migration.sh`
after any migration change; it hard-fails on non-ASCII, backticks, Markdown
headings and prose outside SQL comments.

10 tables: `companies, company_members, profiles, projects, reports,
report_sections, workforce_entries, plant_entries, photos, issues`.
8 enums. Requires **PostgreSQL 15+** (uses `ON DELETE SET NULL (column)`).

### Three independent security layers - do not weaken any

1. **RLS on every table**, resolving `company_id` through
   `public.is_company_member()`, which is `SECURITY DEFINER` so reading
   `company_members` inside a policy cannot re-enter RLS and recurse. This is
   the classic Supabase multi-tenant trap.
2. **Composite foreign keys** on `(parent_id, company_id)` against a
   `unique (id, company_id)` parent, so a report can never reference a project
   in another company even if RLS were bypassed.
3. **Explicit GRANTs.** Migration-created tables carry no privileges of their
   own. Migration 2 grants `authenticated` and `service_role`; migration 4
   revokes everything from `anon` and blocks default privileges re-granting it.
   **If you add a table, you must add its grants.**

### Triggers

- `on_auth_user_created` on `auth.users` - creates company + profile + owner
  membership, so a user can never exist without a company.
- `reports_assign_number` - gapless per-project report numbers under
  `pg_advisory_xact_lock`.

### Storage

Two **private** buckets, `site-photos` and `report-pdfs`. Paths are always
`{company_id}/{project_id}/{filename}`; policies match the leading folder via
`public.storage_company_id()`, which returns NULL rather than raising on a
non-uuid path. **Storage is created but entirely unused so far** - Phase 4.

### The hosted project

The owner has one on the free tier. **This repo is public, so its URL and key are
deliberately not recorded here.** Get them from `.env.local` if the working copy
has one (gitignored, so a fresh container will not) or ask the owner for the
Project URL and publishable key from Project Settings -> API. Neither is secret -
the publishable key is designed for browser bundles and RLS is what protects the
data - but there is no reason to publish them.

State verified live: **all four migrations applied**; anonymous requests return
`401 / 42501 permission denied` on every table; **email confirmation is OFF** so
signup returns a session immediately.

---

## 6. Vercel configuration

| Setting | Required value |
| ------- | -------------- |
| Framework Preset | **Next.js** |
| Root Directory | **`./`** |

Vercel guessed **Other** at import because `main` had no `package.json` then,
which builds the repo as a static site - no `next build`, no functions, no
`proxy.ts` - while still reporting Ready. The owner has since corrected it.

### Environment variables

**Settings -> Environments** (Vercel moved these; there is no longer a top-level
"Environment Variables" item). Scope: **Preview** and **Production**.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as an alternative for older projects.
Set one key variable, not both. `lib/env.ts` prefers the publishable name.

**Do not set `NEXT_PUBLIC_SITE_URL`.** Unset, the app uses Vercel's stable
`VERCEL_BRANCH_URL` for confirmation and reset email links, so Supabase redirect
URLs need configuring once rather than after every push.

**These are inlined at build time, not read at runtime.** A build made before
they were saved has `undefined` compiled in permanently. A plain Redeploy is not
enough - "Use existing Build Cache" is ticked by default and can reuse the old
output. Push a commit, or Redeploy with the cache box unticked.

### Working preview alias

```
https://pierwsze-koty-za-ploty-git-claude-siteboss-pro-b74a40-mikeymcyo.vercel.app
```

Stable for the life of the branch; always points at the newest successful build.
Per-deployment URLs (`...-dyte4gktb-...`) change every push and 404 once
superseded. **Use the alias.** Latest Preview build at writing: commit `b06b878`,
Vercel state success.

---

## 7. What has been verified live, and what has not

### Verified against the owner's hosted Supabase (dev server, this sandbox)

- `npm run test:e2e` - 23 checks, zero console errors
- `npm run test:projects` - 21 checks, zero console errors
- `npm run test:isolation` - company isolation holds through the UI, by guessed
  URL, via the edit form, and via a direct PostgREST call with a real session
  token
- `npm run test:db` - schema and RLS suite passes
- `npm run build`, `typecheck`, `lint` - clean
- The production build (`next build` + `next start`) serves correctly

### Verified 2026-08-27, at `046c11a`, in a fresh container

Re-checked from scratch after a clean `npm install`, with no `.env.local`:

- `npm run build` clean; `npm run lint` clean; `tsc --noEmit` clean. (Note: bare
  `tsc --noEmit` needs a prior `next build` - `app/layout.tsx` uses the
  Next-generated `LayoutProps` global, so typecheck on a cold tree reports
  `TS2304: Cannot find name 'LayoutProps'`. Not a bug; run the build first.)
- All app routes still compile as dynamic (`f`), none accidentally static.
- React error #441's meaning confirmed against React's own `codes.json`.
- The #441 symptom **reproduced locally** in a production build - see section 9.
- Missing Supabase env vars confirmed to 307 every route to `/`, not error.
- A new `lib/env.ts` bug found and reproduced - see section 12.

### NOT verified

**Nothing has been verified against the Vercel deployment itself.** Deployment
Protection (Vercel Authentication) SSO-walls every URL from outside a signed-in
browser, so no automated check has ever reached it. The owner sees the app
because their browser holds a Vercel session; a phone or a script does not.

That gap is why the bug in section 9 was found by the owner and not by the tests.

---

## 8. Current authenticated state

Signup creates a company, profile and owner membership via the database trigger,
lands on `/dashboard`, and the app shell renders. Locally and in the sandbox this
works end to end. Projects can be created, edited and viewed.

On the **deployed preview**, the owner reports the app loads and then hits the
error in section 9, with the main content area blank.

---

## 9. THE LIVE BUG - React error #441 with blank main content

**Reported by the owner on the deployed preview.** Deployment Protection still
blocks access to the preview itself, but the **symptom has now been reproduced
locally** in a production build, which narrows the cause considerably. See
"What the 2026-08-27 session established" below before doing anything else.

### What #441 actually is

Verified 2026-08-27 against React's canonical `scripts/error-codes/codes.json`
(fetched from the React repo, entry `441`) - the decoding below is exact, not
inferred:

> "An error occurred in the Server Components render. The specific message is
> omitted in production builds to avoid leaking sensitive details. A digest
> property is included on this error instance which may provide additional
> details about the nature of the error."

This is **not a React bug and not a client bug**. It means a **Server Component
threw during render in production**, and React deliberately withheld the real
message. The two symptoms - the error and the blank main - are one fault.

### What the 2026-08-27 session established

Reproduced locally with `next build` + `next start`, no Supabase credentials
needed: a session was stubbed and a throw forced, first in the `(app)` layout
and then in the dashboard page. The two produce **measurably different**
responses, and that difference is the diagnostic lever:

| Where the throw happens | HTTP status | Shell (nav, top bar) in server HTML | What the user sees |
| ----------------------- | ----------- | ----------------------------------- | ------------------ |
| `(app)/layout.tsx` - i.e. `lib/auth/session.ts` or `lib/env.ts` | **500** | **never renders** | straight to "Something broke" |
| any **page** under `(app)` | **200** | **renders normally** | shell + **blank main** (the `loading.tsx` skeleton), then "Something broke" |

In the page-throw case the served HTML contains a failed Suspense boundary
carrying the digest, which is the exact fingerprint to look for:

```html
<main ...><div ...><!--$!--><template data-dgst="2821726327"></template>
```

A real Chromium run against that reproduction logged
`Minified React error #441` to the console and rendered `app/error.tsx` with
`Reference: 2821726327` - i.e. the owner's exact report.

**The owner reported "the app loads and then the main content area is blank".
That is the 200 signature.** The `(app)` layout therefore *succeeded*, which
means env vars were present and `getSessionContext()` did resolve the company.

Two of the previously top-ranked candidates are consequently **ruled out**:

- **`lib/env.ts:16`** - ruled out twice over. A layout-level throw would be a
  500 with no shell; and a build with *no* Supabase vars at all was tested
  directly - `hasSupabaseConfig()` is false, so `proxy.ts` 307s every route to
  `/` and no error is ever rendered.
- **`lib/auth/session.ts:52` / `:58`** (`Could not load your company` / not
  linked to a company) - both live in the layout, so both would be a 500 with
  no shell.

**Remaining candidate: a throw inside a page**, and given the owner lands on
the dashboard after sign-in, `app/(app)/dashboard/page.tsx:41`
(`Could not load your dashboard: <PostgREST message>`) is the prime suspect.
The other page-level throws in the table below remain possible if the owner was
on a different screen.

### How to get the real message - still required

The PostgREST message itself is still redacted and still lives in **Vercel's
Runtime Logs**, keyed by the `digest`.

1. On the preview, note the number after **`Reference:`** on the error screen.
   That *is* the digest - `app/error.tsx` already prints it, so no log access is
   needed to obtain it.
2. Vercel -> the project -> **Logs** (Runtime Logs), filter to that deployment.
3. Find the entry whose digest matches. That line carries the un-redacted error.

**A digest cannot be decoded offline.** Verified in the installed Next.js:
`next/dist/server/app-render/create-error-handler.js` computes
`stringHash(err.message + (err.stack || ''))`. The stack contains minified chunk
filenames and offsets that change with every build, so a digest is only
meaningful within the one deployment that produced it - confirmed by observing
the same error message hash to two different digests across two builds. Do not
try to brute-force it; ask the owner for the log line.

### Candidate sources, ranked

Every `throw` reachable from a Server Component render:

| Location | Message | Status |
| -------- | ------- | ------ |
| `lib/env.ts:16` | `Missing environment variable ...` | **ruled out** (layout/proxy level) |
| `lib/auth/session.ts:52` | `Could not load your company: ...` | **ruled out** (layout - would be 500) |
| `lib/auth/session.ts:58` | account not linked to a company | **ruled out** (layout - would be 500) |
| `app/(app)/dashboard/page.tsx:41` | `Could not load your dashboard: ...` | **prime suspect** |
| `app/(app)/projects/page.tsx:29` | `Could not load your projects: ...` | possible |
| `app/(app)/projects/[id]/page.tsx:55,87` | project / project data | possible |
| `app/(app)/reports/page.tsx:27`, `reports/new/page.tsx:26` | reports | possible |

What is still genuinely unknown is **why** a PostgREST query that passes locally
against the same hosted Supabase fails on Vercel. Do not guess at that; get the
log line.

### Proposed fix, not yet applied

Agreed in principle with the owner on 2026-08-27, pending the real message:

1. Fix the actual cause once the log line is readable.
2. **Make this bug class self-diagnosing.** Stop `throw`ing on ordinary
   data-load failures in pages; render an honest inline error panel inside the
   working shell, carrying a stable code and the PostgREST error *code* (e.g.
   `42501`). That is not leaking server internals - no message text, no stack,
   no config - and it is consistent with D11 (no dead ends in the UI).
3. Add `instrumentation.ts` with `onRequestError` so Runtime Logs pair each
   digest with its message explicitly, instead of relying on Next's default.

### Note on the error page itself

`app/error.tsx` renders `error.message`, which **Next.js redacts in production**.
That is why the owner sees a generic message plus a digest rather than anything
useful. This is correct, deliberate behaviour - do not "fix" it by leaking server
error text to the browser. The `Reference:` digest it already prints is the
handle into the Runtime Logs, and is the reason step 1 above needs no log
access.

## 10. Everything already attempted while debugging deployment

So the next session does not repeat any of it:

- Confirmed Vercel is connected via the GitHub App and posts deployment statuses.
- Established that Framework Preset was **Other**, not Next.js - corrected.
- Established that env vars now live under **Settings -> Environments**.
- Established that `NEXT_PUBLIC_*` are **build-time inlined**, so redeploying a
  stale build cannot pick up new values, and that Redeploy reuses the build cache
  by default.
- Explained **"Ready - Stale"** as the signal that a build predates a settings
  change.
- Established that the `404: NOT_FOUND` the owner hit came from a **failed
  Production deployment of empty `main`**, not from the Preview.
- Confirmed nothing in the repo can cause a Ready deployment to 404: no
  `vercel.json`, `next.config.ts` is empty (no `basePath`, `assetPrefix` or
  `output: 'export'`), `package.json` and `app/` are at the root, and `proxy.ts`
  only ever redirects.
- Pushed `b06b878` (documentation only) purely to force a cache-free rebuild.
- Polled the alias repeatedly; it SSO-walls every automated request.

---

## 11. Failed approaches that MUST NOT be repeated

**F1 - Migration tables have no privileges by default.** Postgres checks
table-level `GRANT` before RLS. Without explicit grants every query fails with
`permission denied for table projects`. The local SQL stub once had a blanket
`ALTER DEFAULT PRIVILEGES` that **hid** this; it was removed on purpose. Do not
add it back.

**F2 - The SQL stub is not a substitute for real Supabase.**
`supabase/tests/00_supabase_stubs.sql` lets migrations run on plain Postgres but
missed both halves of F1. Validate schema work against a real Supabase database.

**F3 - `VERCEL_URL` for auth email links.** It changes every deployment, so every
push would silently break password-reset links. Use `VERCEL_BRANCH_URL`.

**F4 - "There is Markdown in the SQL file."** There never was. Verified byte by
byte: pure 7-bit ASCII, zero backticks, zero `##`. The owner was copying the
assistant's chat message. The generator now hard-fails on those patterns. Do not
hunt for Markdown in the SQL; look at what is being pasted.

**F5 - Playwright racing the dev compiler.** A cold `next dev` compiles routes on
first request, which exceeded assertion timeouts and looked like a broken app.
The suites warm routes and use a 60s `COLD_COMPILE_TIMEOUT`. A failing e2e run is
not automatically an app bug.

**F6 - Supabase cookie selector.** `name.includes("auth-token")` also matches the
`-code-verifier` cookies. Match `/^sb-.+-auth-token(\.\d+)?$/` and sort by chunk.

**F7 - `pkill -f "next dev"` kills your own shell**, because the pattern matches
the bash command running it. Resolve PIDs first, then kill by number.

**F8 - Sandbox Docker needs ulimits capped.** `dockerd --default-ulimit
nofile=20000:20000`, plus `npx supabase start -x realtime,storage-api,imgproxy,
mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.

**F9 - "JWT issued at future" is not a clock bug on our side.** Our clock and
Supabase's agree to within a second; the skew is between Supabase's own GoTrue
(mints tokens) and PostgREST (validates them). `lib/supabase/retry.ts` retries
that specific error against a deadline. A first attempt with 3 fixed attempts
over ~900ms was **not enough** - observed skew reached several seconds - so it is
now a 6s budget. Do not sync clocks, and do not widen the retry to other errors.

**F10 - Helpers exported from a `"use client"` module cannot be called on the
server.** `isProjectTab` threw at runtime while type-checking cleanly. Shared
pure constants live in `lib/` with no directive - see `lib/project-tabs.ts`.

**F11 - Do not use `removeAttribute` in tests to bypass HTML validation.** It
desyncs React and produces a hydration mismatch that looks like an app bug.
Submit a value the browser accepts but the schema rejects instead.

**F12 - Do not ask the owner for a Vercel token or a Supabase access token.**
Both grant broad account access and would persist in the transcript. Recommend
the UI flow and explain why. The owner has been receptive to this each time.

**F13 - `curl` POSTs to `/auth/v1/*` time out through this sandbox's proxy** while
GETs succeed. Use `@supabase/supabase-js` for auth probes.

**F14 - `GET /auth/v1/settings` reports a stale `mailer_autoconfirm`.** It said
`false` long after confirmation was turned off. The reliable check is
behavioural: call `signUp()` and see whether a session comes back.

---

## 12. Known issues and technical debt

- **The live #441 bug** (section 9) - unresolved, highest priority, but now
  narrowed to a page-level throw rather than the layout.
- **`lib/env.ts` guard/getter mismatch - a real latent bug, found and reproduced
  2026-08-27, not yet fixed.** `hasSupabaseConfig()` tests the two key names with
  `||` on *trimmed* values, but `env.supabaseKey` selects between them with `??`.
  An **empty-string** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` alongside a valid
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` therefore passes the guard (`""`.trim() is
  falsy, so it falls through to the anon key) but throws in the getter (`""` is
  not nullish, so `??` returns it). Verified: **every route 500s, including
  `/`.** This is *not* the #441 symptom - it is a different, louder failure -
  but it is a live trap given the handoff tells the owner to set one key
  variable and Vercel will happily store one with an empty value. Fix by making
  the getter use the same trimmed-`||` logic as the guard.
- **Deployment Protection is on**, so nothing automated can reach the preview.
  This is what let #441 escape.
- **No CI.** Four good suites, nothing runs them.
- **`types/database.ts` is hand-written**, not generated - there was no live
  project at the time. Now that the schema is applied, regenerate with
  `npx supabase gen types typescript --project-id <ref> > types/database.ts`.
- **Storage buckets exist but are unused** until Phase 4.
- **Team invites are out of scope.** `company_members` is read-only from the
  client; the schema supports multi-user but there is no invite flow.
- **`PROJECT_STATE.md` is superseded by this file** and should probably go.
- **PR #1's description is owner-generated and slightly wrong** - it claims seed
  data (none exists) and "generated" TypeScript types.
- **Test accounts accumulate** in the hosted Supabase project. Each suite run
  creates a few; they cannot be deleted with the publishable key.

---

## 13. Exact next actions, in priority order

1. **Get the real error message for #441.** Ask the owner for the number after
   `Reference:` on the error screen *and* which page they were on, then for the
   matching line from Vercel -> Logs (Runtime Logs) for that deployment. Section
   9 explains why the digest alone cannot be decoded offline. Everything about
   the root cause is guesswork until this arrives.
2. **Fix `lib/env.ts`** (section 12) - independent of #441, small, and testable
   locally right now. Does not need the owner for anything.
3. **Fix #441** based on the real message, then make the class self-diagnosing:
   inline error panels instead of `throw` for data-load failures, plus
   `instrumentation.ts` / `onRequestError`. Section 9 has the agreed shape.
4. **Ask the owner to turn Deployment Protection off** (Settings -> Deployment
   Protection -> Vercel Authentication -> off -> **Save**) and confirm in a
   **private window**. Until then no automated verification of the deploy is
   possible, and this bug class can recur unseen.
5. **Once reachable, run the suites against the deployment**, not just locally:
   `E2E_BASE_URL=<alias> npm run test:e2e` and the same for `test:projects` and
   `test:isolation`. Warn the owner first that this creates throwaway accounts.
6. **Offer a CI workflow** - typecheck, lint, build and `test:db` against a
   `postgres:16` service container. Offered twice, never actioned.
7. **Then Phase 3.**

---

## 14. What Phase 3 must build

Report capture - the heart of the product. Get it right rather than fast.

- Draft report creation from a project, auto-filling project, date, author and
  the trigger-assigned report number.
- Weather (optional). **Workforce** and **plant** entries as repeatable rows,
  ideally pre-filled from the project's previous report to save typing.
- **Work Completed**: a large textarea plus dictation. Wrap the Web Speech API in
  a `useSpeechInput` hook whose contract is audio-in / text-out, so a Whisper
  endpoint can replace it later without touching the UI. **iOS Safari does not
  implement it** - detect support and fall back to the keyboard microphone, which
  types into the same field and works fine.
- Store the raw transcript **verbatim** in `reports.raw_notes`. The user must
  always be able to see what they actually said next to what the AI wrote.
- Restore the **"New report"** action on the project detail page.
- Add `e2e/reports-smoke.mjs` in the shape of the existing suites.

Useful test data - the owner's real reference project:
Lidl South Croydon - External Works / Lidl GB / South Croydon / ref 1470 /
site manager Maciej / Active.

---

## 15. Design and product decisions already made

- **D1** Light-only, high-contrast theme. Used outdoors in sunlight. Dark mode
  was deliberately removed - do not add it back.
- **D2** `proxy.ts`, not `middleware.ts`. Next 16 deprecates the latter.
- **D3** `anon` gets **no** privileges. No anonymous data access anywhere.
- **D4** Both Supabase key names accepted; publishable preferred.
- **D5** `NEXT_PUBLIC_SITE_URL` stays unset on Vercel.
- **D6** With no Supabase config, every route except `/` redirects to the landing
  page rather than throwing a 500.
- **D7** `types/database.ts` hand-written for now (see debt).
- **D8** Native `<select>` on purpose - OS picker wheels beat custom dropdowns
  with gloves on.
- **D9** Raw dictated notes stored verbatim alongside AI output; likewise
  `photos.original_caption` beside `caption`.
- **D10** Touch targets at least 48px; bottom-nav items 56px.
- **D11** No fake buttons. If a feature is not built, say so in the UI rather
  than shipping a control that goes nowhere.
- **D12** Tabs are URL state (`?tab=`), not component state, so they survive a
  reload and can be shared.

---

## PROMPT FOR NEXT CLAUDE SESSION

Paste everything below into a fresh Claude Code session.

---

I'm continuing work on SiteBoss Pro, a mobile-first construction site reporting
app. Read `HANDOFF.md` in the repository root first - it is the current verified
state and explains the product, architecture, database, deployment, and a list of
failed approaches that must not be repeated. Trust it over `PROJECT_STATE.md`,
which is older.

Context you need immediately:

- There are now two working branches, `claude/siteboss-pro-planning-8y80n2` and
  `claude/siteboss-pro-react-441-diagnosis-bhvwk8`. Ask me which one to use
  before pushing. Never push to `main`, and do not merge PR #1.
- Phases 1 (auth, database, app shell) and 2 (projects CRUD and the project
  detail screen) are complete and pass their test suites against my live
  Supabase project. Do not rebuild them.
- My hosted Supabase project has all four migrations applied and email
  confirmation off. Ask me for the Project URL and publishable key if you need
  them - the repo is public so they are not stored in it.
- The app is deployed to a Vercel Preview at the branch alias listed in
  HANDOFF.md section 6.

There is one live bug, and it is the first priority. On the deployed preview the
app loads but the main content area is blank and the console shows **Minified
React error #441**. A previous session reproduced that symptom locally and
narrowed it: the `(app)` layout is fine, so it is a **page-level** Server
Component throw, most likely `Could not load your dashboard` at
`app/(app)/dashboard/page.tsx:41`. HANDOFF.md section 9 has the full reasoning,
the evidence, and what is still unknown. Read it before touching anything.

What is still missing is the real PostgREST message. Ask me for two things: the
number printed after **`Reference:`** on the error screen, and which page I was
on. Then ask me to find the matching line in Vercel -> Logs for that deployment.
A digest cannot be decoded offline - section 9 explains why - so do not guess at
the cause, and do not ask me for a Vercel token.

There is also a smaller, unrelated `lib/env.ts` bug written up in section 12
that can be fixed immediately without anything from me.

Also note: Vercel Deployment Protection is currently on, which SSO-walls the
preview from any automated request. That is why this bug reached me instead of
being caught by tests. Tell me exactly what to click to turn it off, then verify
the deployment yourself by running the existing suites against the live URL with
`E2E_BASE_URL`.

Once the bug is fixed and the deployment is verified, ask me before starting
Phase 3 (report capture: workforce, plant, dictation). HANDOFF.md section 14 has
its full scope.

Please verify claims by running things rather than assuming, tell me plainly when
something is unverified, and do not leave non-functional UI in the app.
