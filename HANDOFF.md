# SiteBoss Pro - Handoff

For a Claude Code session with no prior context. Every claim here was checked
against the repository or by running something. Where something is unverified,
it says so explicitly - treat that distinction as load-bearing.

**Written:** 2026-08-26 · **Last updated:** 2026-08-28

**Branch:** `claude/siteboss-pro-react-441-diagnosis-bhvwk8`
**Recovery head:** `6d3f554` - summary schema validated and synchronized

## Current state - read this before the historical sections below

This block supersedes the old statements later in this file that Phase 6 has
not started. Issues and the Daily Report PDF were completed in `5047110`. The
Progress/Completion schema followed in `a632c4f`, with the tenant-key fix and
durable PostgreSQL suite in `6d3f554`.

The current implementation completes the remaining core workflow:

- Progress Reports consolidate final Daily Reports for a fixed date range.
- Completion Reports prefer issued Progress Reports while retaining every
  underlying Daily Report as provenance, without feeding it to the writer
  twice.
- Both kinds have evidence-grounded AI drafting, protected manual edits,
  curated photographs and issues, draft PDF previews, stored issued PDFs and
  immutable final state.
- Closing an issue now requires a recorded resolution. Finalising a summary
  snapshots its issue status and resolution.
- Reports, Project detail and Dashboard list all three document types.

The migration `20260828000005_summary_reports.sql` has passed its real local
PostgreSQL suite but has **not** been applied to hosted Supabase. Apply it
before deploying application code that queries `summary_reports`. Never deploy
the code first: Reports and Dashboard intentionally query the new tables.

Dependency-free regression suites pass, including
`test:summary-reports`. A production dependency install, lint, typecheck and
build must pass in a dependency-complete environment before release.

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
report generation, issues + PDF, polish. **Phases 1-5 are done.**

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
| AI | OpenAI SDK **7.8.0**, chat completions with `json_schema` structured output |
| Tests | Playwright 1.56.1 (pinned) + psql-driven SQL tests |
| Hosting | Vercel (Preview only; nothing merged to main) |

Installed and in use: `@react-pdf/renderer` (Daily, Progress and Completion PDFs).

**Route protection lives in `proxy.ts` at the repo root.** Next.js 16 deprecates
`middleware.ts`; having both is a hard build error.

---

## 3. Repository and branch

- Repo: `mikeymcyo/pierwsze-koty-za-ploty` - **public**
- **Branches.** Work is on `claude/siteboss-pro-react-441-diagnosis-bhvwk8`
  (head `9829e94`). The older `claude/siteboss-pro-planning-8y80n2` is stale
  at `046c11a` and carries PR #1; it has NOT been kept in sync. Ask the owner
  which branch is canonical before pushing.
- **`claude/phase5-staging` is rubbish and should be deleted.** It was a
  transfer device (see F15); every commit in it is already contained in
  `260af4a`. Delete with
  `git push origin --delete claude/phase5-staging`. Its own Vercel Previews
  failed by design - it never carried a lockfile - which is expected, not a
  problem with the code.
- Base: `main`. **`main` is completely empty** - the owner deleted the four
  legacy static files. Production builds therefore **fail**, and any Production
  URL returns `404: NOT_FOUND`. Expected; do not "fix" it.
- **PR #1** is open and must **not** be merged yet (owner's instruction).
- **No CI exists.** No `.github/workflows/`. Nothing runs the test suites
  automatically. Adding one has been offered three times and not yet requested.

Run `git log --oneline` for current history rather than trusting a copy here.

---

## 4. What the completed phases contain

**Phase 1** - foundation, database, auth, app shell:
sign up / in / out / password reset as zod-validated server actions; the full
10-table schema with RLS; `proxy.ts` session refresh and route gating; the
mobile-first shell (bottom nav with raised centre action, desktop sidebar);
dashboard, projects, reports and profile pages reading real data; a light-only
high-contrast theme; the UI primitive set.

**Phase 2** - projects:
`app/(app)/projects/actions.ts` (create/update/delete, zod-validated); a shared
`ProjectForm` covering every schema column; `/projects/[id]` with **Overview /
Reports / Photos / Open Issues** tabs driven by `?tab=`; `/projects/[id]/edit`.

**Phase 3** - report capture:
`app/(app)/reports/actions.ts`; `/reports/new` project picker and
`/reports/[id]` capture screen; workforce and plant as repeatable rows that
carry over from the project's previous report; weather; the Work Completed
field with dictation via `lib/hooks/use-speech-input.ts` (see below); raw notes stored
verbatim in `reports.raw_notes`; the "New report" action on the project page.

**Dictation on iOS** (`a9ed7e7`). iOS Safari **does** implement
`webkitSpeechRecognition` - it has since 14.5, so `supported` is true on an
iPhone and the Dictate button is what gets used. An earlier comment claimed
the opposite, and the keyboard-microphone fallback it described was never
reached.

What iOS does not honour is `continuous`: a session ends by itself after a
short silence and is capped well under a minute. The hook used to set
`listening` to false and stop there, so 30 seconds of dictation was stored as
two sentences - the rest was spoken into a dead microphone with the button
quietly back on "Dictate".

The hook now holds **intent** separately from whether a session is running and
relaunches on every end it did not ask for. `lib/speech/transcript.ts` is pure
and alias-free, and holds the two rules that restarting needs: finals are
counted against a watermark, because a new session renumbers its results from
zero and engines differ on what `resultIndex` means; and the unsettled tail is
kept, because the phrase in flight when a session ends never reaches `isFinal`
and is otherwise lost. Three restarts with nothing recognised is treated as a
refusal - Safari can decline to start from a timer rather than a tap - and says
so rather than spinning. Any recognised text resets that count.

**Starting a report is a POST, never a GET** - the insert is what makes the
`reports_assign_number` trigger allocate the next gapless number, so a link
would burn numbers on every prefetch.

**Phase 4** - photos:
client-side resize before upload (works on a bad signal), private-bucket
storage under `{company_id}/{project_id}/{filename}`, signed URLs via
`lib/photos-signing.ts`, `PhotoUpload` and `PhotoGrid`.

Revisited on 2026-08-28 (`1d9474e`) after the owner found the uploader
unusable on an iPhone. It had one input carrying `capture="environment"`,
which sends Safari straight to the camera with **no gesture that reaches the
photo library** - so photos taken earlier in the day could not be attached.

`lib/photo-sources.ts` now holds the source table, and each source gets its
own input with fixed attributes:

| Button | accept | capture | multiple |
| ------ | ------ | ------- | -------- |
| Take Photo | `image/*` | `environment` | no |
| Choose from Photo Library | `image/*` | - | **yes** |
| Choose File | `image/*` + extensions | - | **yes** |

**Only `capture` is a hard instruction to iOS.** Without it Safari shows its
own sheet (Photo Library / Take Photo / Choose File); no attribute exists
that opens the library directly. So the two non-camera buttons do not skip
that sheet - what they do is stop the tap landing in the camera, with
multi-select enabled when it gets there. Do not "fix" this by trying to
bypass the sheet; it cannot be done from the web.

`isSupportedImageFile` guards what actually arrives, because `accept` is a
filter on the picker and not a promise: a Files pick can turn up as
`application/octet-stream`, so HEIC is judged on its extension and a PDF is
refused with a message rather than uploaded into a tile that never loads.

**Photos can also be added to the project itself**, from Project -> Photos,
with `reportId` null. That was always supported and is not a loosening:
`photos.report_id` is nullable and commented "photos captured against the
project outside of any report", `attachSchema` has always taken a nullable
`reportId`, and photo RLS is company-scoped rather than report-scoped. A
project photo carries no `report_id`, so it must never appear on a report
screen - or later in that report's PDF. `photos-smoke.mjs` asserts that.

**Phase 5** - AI report drafting:
`lib/ai/report-generation.ts` builds the prompt and calls OpenAI with
`json_schema` structured output; `app/(app)/reports/ai-actions.ts` writes
`report_sections` (upsert on `report_id,section_type`, so regenerating
replaces rather than duplicates); `components/reports/report-draft.tsx`
renders the sections, allows editing, and shows the raw notes beside them.

Reworked on 2026-08-28 (`d85222f`) after the owner generated a real report and
found the output was his own notes with the commas moved. The prompt is now in
`lib/ai/prompt.ts`, apart from the client that sends it.

**Why it was literal.** The old prompt told the model to "keep the site
manager's meaning exactly, while fixing grammar and punctuation" - a
commission to copy-edit - handed the notes over as "THE SITE MANAGER'S OWN
WORDS (verbatim)", and asked for "plain sentences". Under a hard ban on
invention with nothing saying that **register is not a fact**, echoing the
source is the safest thing a model can do. It was not malfunctioning.

**What it says now.** That this is a rewrite and not a proofread; what should
change (register, UK trade terminology, structure, impersonal past voice);
that scattered notes about the same work are to be consolidated rather than
followed in order; and a worked example of a rough note becoming report prose.

**The line between register and fact.** Neutral presentation and process
wording is allowed where the notes support it - "making-good works were
undertaken", "to provide a consistent finished appearance" after redecoration.
Claims of quality, compliance, approval or fitness for purpose are not, unless
the source data says so explicitly: **secure, watertight, compliant, to
specification, correctly installed, satisfactory, satisfactorily completed,
approved, inspected, certified, tested, safe, suitable, complete in accordance
with requirements.** A note about rods and washers cannot support "a secure
installation", and that is the sentence a dispute turns on. Do not relax this
list without asking the owner - it was his call, on his liability.

**Silence is not evidence of absence** (`43124e8`). The first real generation
produced "No delay was recorded" from notes that never mentioned programme.
The cause was not the system prompt but `lib/report-sections.ts`: each brief
becomes the `description` of that property in the JSON schema, so it sits
beside the field being filled and competes with the system prompt for it. The
summary brief asked "whether the job is on track", and a field that must be
filled gets filled. **No brief may pose a question the notes might not
answer** - the guard test asserts none contains the word "whether" - and the
system prompt now names the nil returns outright: no delays, no issues, no
incidents, nothing reported, deliveries complete, on programme.

Photo tags are labelled as evidence that a photograph exists, not that an
event occurred. The `health_safety` brief no longer tells the model to say
nothing was reported when the notes are silent; a nil return is itself a
claim.

The prompt's first rule is **never invent**, and its second is that an **empty
section is a correct answer** - a progress report is a contractual record that
can be read in a dispute, so padding it would be worse than not having the
feature. Empty sections are dropped, not rendered.

`reports.raw_notes` is never touched by generation. Editing a section flips
`ai_generated` to false.

Regenerating is bounded by two rules that pull against each other, both in
`lib/reports/regeneration.ts`. It **replaces** what the model wrote, clearing
sections a new draft no longer supports - a stale paragraph under a heading
today's notes do not carry is a false claim. It **never touches** a section
carrying `ai_generated = false`, which `updateSection` sets the moment anybody
edits: that paragraph is the site manager's, in a document going to a client
with his name on it. The screen says which way it went rather than leaving him
to notice.

**Historical note:** Phase 6 was subsequently completed in `5047110`.

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
non-uuid path. Both buckets are now in use; issued PDFs are never regenerated.

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

### OpenAI (Phase 5)

```
OPENAI_API_KEY          required for drafting; NO NEXT_PUBLIC_ prefix
OPENAI_MODEL            optional; defaults to what the installed SDK documents
OPENAI_BASE_URL         optional; only for a proxy or the test stub
```

`OPENAI_API_KEY` is **server-side only** - never give it a `NEXT_PUBLIC_`
prefix, which would publish it in the browser bundle. Unlike the Supabase
variables it is read at request time, not inlined at build time, so changing it
does not need a rebuild.

**Without it the app still builds and works.** The drafting panel says the
feature is not switched on rather than showing a button that would fail.

**Do not set `NEXT_PUBLIC_SITE_URL`.** Unset, the app uses Vercel's stable
`VERCEL_BRANCH_URL` for confirmation and reset email links, so Supabase redirect
URLs need configuring once rather than after every push.

**The `NEXT_PUBLIC_*` variables are inlined at build time, not read at
runtime.** A build made before they were saved has `undefined` compiled in
permanently. A plain Redeploy is not enough - "Use existing Build Cache" is
ticked by default and can reuse the old output. Push a commit, or Redeploy with
the cache box unticked.

### Working preview alias

```
https://pierwsze-koty-za-ploty-git-claude-siteboss-pro-b74a40-mikeymcyo.vercel.app
```

Stable for the life of the branch; always points at the newest successful build.
Per-deployment URLs (`...-dyte4gktb-...`) change every push and 404 once
superseded. **Use the alias.** The alias tracks whichever branch it was created
for - confirm it points at `claude/siteboss-pro-react-441-diagnosis-bhvwk8`
before trusting what you see there, since work moved branches on 2026-08-27.

---

## 7. What has been verified live, and what has not

### Verified 2026-08-27 against a local Supabase (all four migrations applied)

Every suite passed, plus `build`, `lint` and `tsc --noEmit`:

```
npm run test:e2e        auth, nav, sign out, validation
npm run test:projects   projects CRUD
npm run test:reports    capture, numbering, carry-over, delete
npm run test:photos     upload, resize, signed URLs
npm run test:isolation  company isolation, incl. reports
npm run test:ai         the whole drafting pipeline, against a local stub
npm run test:db         schema and RLS
```

### Verified 2026-08-28, in a sandbox with no Supabase and no Docker

`1d9474e` (the photo UX work) was checked with `build`, `lint`,
`tsc --noEmit` and:

```
npm run test:photo-sources   the three media sources, 37 checks
npm run test:ai-prompt       the drafting prompt contract, briefs included
npm run test:build-ref       the profile build marker
npm run test:dictation       transcript accumulation and restart policy
npm run test:regeneration    what a regeneration may and may not overwrite
```

These three need neither Supabase nor a dev server, so they run anywhere.

That suite is deliberately the one photo test that needs **neither Supabase
nor a dev server**, so it runs anywhere: it asserts the source table and the
file-type guard directly, then makes a real Chromium parse those exact
attributes and hold a multi-photo selection. It imports `lib/photo-sources.ts`
straight into Node, which works because Node 22 strips types - which is also
why that module must stay free of path aliases and runtime imports.

**The browser-level photo assertions added to `photos-smoke.mjs` in that
commit have never been executed** - the three buttons on the live capture
screen, the real multi-photo upload, and the project-level photo. They need
Supabase, which needs Docker, which costs `git push` for the session (F15).
Run them before trusting them.

`npm run test:ai` needs no OpenAI key and costs nothing - `e2e/stub-openai.mjs`
stands in for the endpoint. Run the app with
`OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:4010/v1 npm run dev`.

`tsc --noEmit` must run **after** a build: `app/layout.tsx` uses the
Next-generated `LayoutProps` global, so a cold typecheck reports `TS2304`.

### Verified on the owner's iPhone, against the hosted Supabase and real OpenAI

- **Report drafting quality is acceptable** (Phase 5's last open question). The
  prompt at `d85222f` plus the brief fixes at `43124e8` produce professional
  construction-report prose rather than a paraphrase of the notes.
- **Long dictation is whole.** A continuous 60-90 second dictation was compared
  against what was actually said. The `a9ed7e7` restart loop holds on real iOS
  Safari - it does start a new session from a timer.
- **The mobile photo UX works on the iPhone**, confirmed after `1d9474e`: Take
  Photo, Choose from Photo Library and Choose File all behave, and photos reach
  the report and the project.

### NOT verified

- **No automated check has ever reached the Vercel deployment.** Deployment
  Protection SSO-walls every URL. Everything confirmed on the Preview was
  confirmed by the owner by hand, which is why the bug in section 9 was found
  by him and not by the tests. The profile screen's build marker is there so he
  can at least say which commit he was looking at.
- **`npm run test:ai` has not been run since `43124e8`.** The regeneration
  behaviour it covers - clearing stale AI sections, and now refusing to
  overwrite edited ones - has been exercised by hand on the phone but not by
  that suite, and the delete's PostgREST filter has never been executed in a
  test. Run it first wherever a Supabase is available.

---

## 8. Current authenticated state

Signup creates a company, profile and owner membership via the database
trigger, lands on `/dashboard`, and the app shell renders. Projects, reports,
photos and AI drafting all work end to end locally and in the sandbox against a
local Supabase.

On the **deployed preview** the owner previously hit the error in section 9.
Since Phase 5 the page-level failures render an error panel with a code instead
of a blank screen, so a recurrence should now be self-describing.

---

## 9. THE LIVE BUG - React error #441 with blank main content

**Status: diagnosed, not fixed. Intermittent. Still open.**

### What #441 is

Verified against React's canonical `codes.json`: "An error occurred in the
Server Components render. The specific message is omitted in production builds
... A digest property is included." A Server Component threw and React withheld
the message. Not a React bug, not a client bug.

### What was established by reproduction

Reproduced locally in a production build by stubbing a session and forcing a
throw. The two cases are **measurably different**, and that is the diagnostic
lever:

| Where the throw happens | HTTP | Shell in server HTML | What the user sees |
| --- | --- | --- | --- |
| `(app)/layout.tsx` - `session.ts` / `env.ts` | **500** | never renders | straight to "Something broke" |
| any **page** under `(app)` | **200** | renders normally | shell + blank main, then "Something broke" |

The owner reported "the app loads and the main content area is blank" - the 200
signature. **The layout therefore succeeded**, which rules out `lib/env.ts` and
both throws in `lib/auth/session.ts`. A build with no Supabase vars was also
tested directly: it 307s every route to `/` and never errors.

So it was a **page-level** throw. Since Phase 5 those pages no longer throw at
all (see below), so this exact failure should now present as an error panel with
a code instead of a blank screen.

### Outstanding evidence

The owner reported a recurrence with **`Reference: 2847415232`** on the
deployment for `046c11a`, around 14:14. That digest was never resolved to a
message. A digest **cannot be decoded offline** - Next computes
`stringHash(message + stack)` and the minified stack changes every build - so it
is only meaningful in that deployment's Runtime Logs.

Separately, `instrumentation.ts` caught a real occurrence during testing:

```
message="Could not load your company: JWT issued at future"  path=/dashboard?_rsc=
```

That is the F9 clock skew getting past the 6s retry budget. **It is a candidate,
not a conclusion** - it lives in the layout, which would give a 500, not the
blank main the owner described. Do not treat it as solved. If it recurs, the log
line will now say so outright.

### How to read the next occurrence

`instrumentation.ts` writes one greppable line per server error:

```
[siteboss] server error digest=<n> route=<r> type=<t> path=<p> method=<m> message="<real message>"
```

Ask the owner for the number after **`Reference:`** on the error screen, then
search Vercel -> Logs for that number. No timestamp archaeology.

### Error handling since Phase 5

Page-level data loads no longer throw. `components/ui/load-error.tsx` renders in
place, keeping the shell and navigation, and shows the PostgREST error **code**
(e.g. `42501`) - short, not sensitive, and enough to diagnose. The message stays
server-side. Where a query fails the matching empty state is **dropped**, not
rendered: "no projects yet" under an error would assert something untrue.

Still throwing deliberately: `lib/env.ts` and `lib/auth/session.ts` (layout and
proxy, where there is genuinely nothing to render), and the mutation actions.

Do not "fix" `app/error.tsx` by leaking server error text to the browser.

---

## 10. Everything already attempted while debugging deployment

Kept so nobody repeats it:

- Vercel is connected via the GitHub App and posts deployment statuses.
- Framework Preset was **Other**, not Next.js - corrected by the owner.
- Env vars now live under **Settings -> Environments**.
- `NEXT_PUBLIC_*` are **build-time inlined**; Redeploy reuses the build cache by
  default, so a stale build cannot pick up new values.
- The `404: NOT_FOUND` came from a **failed Production deployment of empty
  `main`**, not from the Preview.
- Nothing in the repo can make a Ready deployment 404: no `vercel.json`,
  `next.config.ts` is empty, `package.json` and `app/` are at the root, and
  `proxy.ts` only ever redirects.
- The alias SSO-walls every automated request.

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
mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. But read
F15 first - starting Docker at all has a serious cost.

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

**F15 - Starting Docker in this sandbox destroys `git push`.** Bringing up a
local Supabase needs Docker, and Docker rewrites `/etc/resolv.conf` and
`/etc/hosts`. That breaks the session's credential injection for GitHub: reads
(`git ls-remote`, clone) keep working because the repo is public, but every push
fails with `could not read Username for 'https://github.com'`. It is **not
recoverable by guessing** - the gateway is not a DNS server, the leftover Docker
iptables rules are inert, ports 2024/2025 are not a git proxy, and re-attaching
the repo does not refresh credentials. If you need a local Supabase, assume you
are trading away push for the rest of the session, and land the work by spawning
a fresh session. Do the pushing first, or accept the trade knowingly.

**F16 - The project does not use Prettier.** There is no config and it is not a
dependency, and default Prettier disagrees with the hand-maintained style - it
reformats untouched files like `components/ui/card.tsx`. Running
`npx prettier --write` on a file produces a huge diff of pure noise. Match the
surrounding style by hand.

**F17 - An uncontrolled textarea can merge pre-hydration typing.** A
`<textarea defaultValue={...}>` typed into before React hydrates can end up with
the typed text spliced onto the server-rendered value. Observed producing
`"Rewritten by the site manager.STUBBED-SECTION summary"`. In a client-facing
report that is silent corruption, so the report section editors are controlled
and keyed on their content.

**F18 - Do not push source without `package-lock.json`.** Vercel runs `npm ci`
when a lockfile exists, and `npm ci` fails hard if the lockfile does not match
`package.json`. The lockfile is ~250KB and cannot be transferred through the
GitHub API, so a session without push must regenerate it with `npm install`
rather than skip it.

**F19 - A fresh session starts from a fresh clone; uncommitted work is gone.**
The container is rebuilt per session and the repo re-cloned, so whatever the
last session had in its working tree does not survive - there is no stash and
nothing to recover. It also checks out whichever branch the session is
configured with, which may not be the branch the work is on: check
`git log --oneline -1` before believing you are where you think you are. The
cost is only ever redoing that work, so commit early rather than holding a
tree.

**F20 - One `<input type="file">` cannot serve both the camera and the photo
library on iOS.** `capture="environment"` is not a hint there: it opens the
camera and offers no way out. Swapping the attribute on a shared input before
`.click()` does not fix it either - Safari reads `capture` when the picker
opens, not when React commits, so the tap can race the render. Give each
source its own input with fixed attributes. See section 4.


**F21 - A test double that copies a string from the app will silently stop
testing anything.** `e2e/stub-openai.mjs` found the notes by splitting the
prompt on a hardcoded copy of its heading. Rewording the prompt left the stub
reading an empty string, and the pipeline test would have passed on nothing.
It imports the label from `lib/ai/prompt.ts` now. Import the contract; do not
retype it.

**F22 - A JSON-schema property `description` is an instruction, not a comment.**
`lib/report-sections.ts` briefs are sent as the description of each property.
They sit beside the field the model is filling and can beat the system prompt
for that field: "whether the job is on track" produced "No delay was recorded"
while the system prompt was busy forbidding invention. Fix a drafting problem
in the briefs before assuming the system prompt is at fault.

**F23 - iOS Safari ignores `continuous`, and a comment said it had no speech
API at all.** Both cost real dictation. `webkitSpeechRecognition` exists on
iOS; what does not work is a session outliving a pause. Do not trust a comment
about platform support that nobody re-checked - and do not treat `onend` as
the user having finished. See section 4.
---

## 12. Known issues and technical debt

- **#441 is diagnosed but not closed** (section 9). Digest `2847415232` is still
  unresolved. It is intermittent.
- **`claude/phase5-staging` should be deleted** (section 3).
- **`claude/siteboss-pro-planning-8y80n2` is stale** at `046c11a` and carries
  PR #1, whose description is owner-written and slightly wrong (it claims seed
  data, which does not exist, and "generated" types, which are hand-written).
- **Deployment Protection is on**, so nothing automated can reach the preview.
- **No CI.** Eleven suites now, nothing runs them. Offered three times. Five
  of them need neither Supabase nor a dev server, so a workflow running
  those plus typecheck, lint and build would be cheap and worth having.
- **`types/database.ts` is hand-written.** Regenerate with
  `npx supabase gen types typescript --project-id <ref> > types/database.ts`.
- **Team invites are out of scope.** `company_members` is read-only from the
  client.
- **`PROJECT_STATE.md` is superseded by this file** and should be deleted.
- **Test accounts accumulate** in the hosted Supabase project.
- **The photo assertions in `photos-smoke.mjs` added by `1d9474e` are
  unexecuted** (section 7). The rest of that suite is unchanged and passed on
  2026-08-27.
- **`saveReport` replaces workforce and plant non-atomically** (delete then
  insert). Validation runs first so a rejected submission cannot lose rows, but
  a mid-write failure could. Acceptable for the MVP; an RPC would fix it.

---

## 13. Historical next actions (completed or superseded)

1. **Review the Phase 6 scope in section 14 with the owner before building any
   of it.** He has asked for that explicitly.
2. **Run `npm run test:photos` and `npm run test:ai` wherever a Supabase is
   available** - the newest assertions in both have never been executed
   (section 7).
3. **Delete the staging branch** - `git push origin --delete
   claude/phase5-staging`. Its failed Previews are expected (F18) and clear with
   it.
4. **Confirm the Preview built.** Vercel -> Deployments, the newest build of
   `claude/siteboss-pro-react-441-diagnosis-bhvwk8` at `9829e94`. The profile
   screen now shows the running build's short SHA, so this is checkable from
   the phone rather than the dashboard.
5. **`OPENAI_API_KEY` is already set** under Settings -> Environments ->
   Preview, and drafting has been exercised against a real model.
6. **Ask the owner to turn Deployment Protection off** (Settings -> Deployment
   Protection -> Vercel Authentication -> off -> Save) and confirm in a private
   window. Until then nothing automated can check the deployment.
7. **Once reachable, run the suites against the deployment** with
   `E2E_BASE_URL=<alias>`. Warn the owner first: this creates throwaway accounts.
8. **Close out #441.** If it recurs, the `[siteboss]` log line now names the
   cause outright. If the cause is the F9 clock skew, consider widening the
   retry budget - but only with evidence, and do not widen it to other errors.
9. **Offer a CI workflow** - typecheck, lint, build, `test:db`. Offered three
   times, never actioned.
10. **Then Phase 6.** Completed in `5047110`.

---

## 14. Historical Phase 6 scope (completed)

Two things, and they are the last of the core workflow.

**Issues.** The `issues` table already exists with `priority`
(low/medium/high/critical) and `status` (open/in_progress/closed), and the
project detail page already has an **Open Issues** tab reading it. What is
missing is creating, editing and closing them, and attaching them to a report.

**The PDF.** `@react-pdf/renderer` is installed. The report already has
everything it needs: numbered header, project and client, date, weather,
workforce and plant tables, the generated sections in `REPORT_SECTION_ORDER`,
and photos with captions. Write to the private `report-pdfs` bucket under
`{company_id}/{project_id}/{filename}` and record the path in
`reports.pdf_path`; serve it with a signed URL exactly as photos are served in
`lib/photos-signing.ts`.

Finalising a report should set `status = 'final'` and `finalised_at`. The delete
action already refuses to touch a finalised report - keep that.

Add `e2e/pdf-smoke.mjs` in the shape of the existing suites.

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
- **D13** The drafting prompt forbids invention and treats an empty section as a
  correct answer. A progress report is a contractual record; padding it with
  plausible detail would be worse than not having the feature.
- **D14** Page-level data loads render an error panel in place rather than
  throwing. The panel carries the database error code, never the message.
- **D15** `OPENAI_API_KEY` is server-side only and read at request time. With it
  absent the UI says the feature is off rather than offering a dead button.
- **D16** The media source is named in the app - Take Photo / Choose from Photo
  Library / Choose File - rather than left to iOS's sheet, and each has its own
  input. `capture` appears on the camera input and nowhere else. Adding it back
  to a shared input re-breaks the library (F20).
- **D17** Photos may belong to a project with no report. `report_id` was
  designed nullable for it and photo RLS is company-scoped, so this adds no
  privilege. A project photo must not render on a report screen.
- **D18** A file that is not an image is refused in the browser with a message,
  not uploaded. `accept` filters a picker; it does not guarantee what arrives.
- **D19** Drafting rewrites, it does not proofread. Lifting the register and
  consolidating notes is the job; the facts stay put. "Never invent" was always
  meant to protect the facts, never to force the model to echo the wording.
- **D20** Neutral presentation wording is allowed where the notes support it;
  quality, compliance, approval and fitness-for-purpose wording is not. The
  banned list is in `lib/ai/prompt.ts` and is the owner's decision.
- **D21** Silence is not evidence of absence. No section brief may pose a
  question the notes might not answer, and a nil return - "no delays", "nothing
  reported" - is a claim like any other.
- **D22** Regenerating clears the sections it no longer supports, but only ones
  the AI wrote. `ai_generated` is what separates them: `updateSection` flips it
  to false, so an edited section survives regeneration's clear-out. It is still
  overwritten if the new draft fills that same section - that is the existing
  behaviour of a button labelled "Rewrite from my notes", not an oversight, but
  it has not been put to the owner.
- **D22b** Dictation recovers from an end nobody asked for, and never fails
  silently: if it cannot carry on it says so and asks for a tap. Losing a site
  manager's words without telling him is the worst outcome available.
- **D24** A section a person has edited is theirs. Regeneration neither
  overwrites nor deletes it, and the screen says how many were kept - skipping
  silently would confuse as much as overwriting silently. `ai_generated` is the
  only thing separating the two, so nothing may write it true on content a user
  supplied.
- **D23** The profile screen names the running build from
  `VERCEL_GIT_COMMIT_SHA`, and nothing else from the environment. Off Vercel it
  renders nothing rather than a placeholder.

---

## ARCHIVED PROMPT FOR THE OLD PHASE 6 SESSION - DO NOT USE

Paste everything below into a fresh Claude Code session.

---

I'm continuing work on SiteBoss Pro, a mobile-first construction site reporting
app. Read `HANDOFF.md` in the repository root first - it is the current verified
state and includes a list of failed approaches that must not be repeated. Ignore
`PROJECT_STATE.md`, which is obsolete.

Where things stand:

- Work is on `claude/siteboss-pro-react-441-diagnosis-bhvwk8`, head `9829e94`.
  The other branch is stale. Never push to `main`, and do not merge PR #1.
- **Phases 1-5 are complete and Phase 5 is closed.** Auth and schema, projects,
  report capture with dictation, photos, and AI drafting. I have tested drafting
  and long dictation on my iPhone against the real OpenAI API and they are good.
  Do not rebuild any of it.
- **Historical instruction only:** Phase 6 was next at the time. Section 14 has
  the scope. I want to review it with you before you build any of it.

Two recent commits followed the phases rather than extending them.

`1d9474e` reworked the Phase 4 photo UX: the uploader was sending my iPhone
straight to the camera with no way to reach the photo library. It now offers
Take Photo, Choose from Photo Library and Choose File as three separate
buttons, the library and Files pickers take several photos at once, and photos
can be added to a project as well as to a report. Section 4 explains what iOS
will and will not let us control there - do not try to bypass Safari's own
sheet, it cannot be done.

`d85222f` and `43124e8` reworked the Phase 5 drafting. Drafting works against
the real OpenAI API - I have generated a report on my phone - but the output was
my own notes with the commas moved, and the summary asserted "No delay was
recorded" from notes that never mentioned programme. The prompt now commissions
a rewrite rather than a proofread, draws an explicit line between register,
which may change, and facts and quality claims, which may not, and refuses to
turn silence into a nil return. Section 4 has the banned wording and why; that
list is my decision, so ask me before relaxing it. Regenerating now also clears
the sections a new draft no longer supports, without touching ones I have
edited.

`a9ed7e7` fixed dictation. I spoke for 30 seconds and only a couple of
sentences were saved: iOS ends the recognition session at the first pause, and
nothing restarted it. It now keeps going, keeps the phrase that was in flight,
and tells me if it cannot carry on instead of stopping quietly.

The profile screen shows the running build's short commit SHA, so I can tell
from my phone which deployment I am testing.

Unverified: I have not tried the photo buttons on my iPhone, I have not yet read
a draft from the reworked prompt, and the browser-level assertions in
`e2e/photos-smoke.mjs` and `e2e/ai-smoke.mjs` have never been run - those need a
Supabase, and starting Docker costs the session its push (F15).
`npm run test:photo-sources`, `test:ai-prompt` and `test:build-ref` run anywhere
and pass.

Then the housekeeping in section 13: delete the leftover
`claude/phase5-staging` branch and confirm the Preview built on Vercel. My
`OPENAI_API_KEY` is in place under Settings -> Environments -> Preview.

One bug is still open: intermittent React error #441 on the deployed preview,
digest `2847415232`, described in section 9. It is diagnosed as a page-level
Server Component throw, and since Phase 5 those pages render an error panel with
a database error code instead of a blank screen - so if it recurs it should
finally say what it is. `instrumentation.ts` also writes a `[siteboss]` log line
pairing each digest with the real message. Do not guess at the cause; ask me for
the log line.

A warning that cost the last session badly: **do not start Docker.** Bringing up
a local Supabase rewrites the sandbox's DNS and permanently breaks `git push`
for the rest of the session. See F15.

Please verify claims by running things rather than assuming, tell me plainly
when something is unverified, and do not leave non-functional UI in the app.
