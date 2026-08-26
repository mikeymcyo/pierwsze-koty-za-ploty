# SiteBoss Pro - Project State & Handoff

Written for a Claude session with no prior context. Everything here was verified
by reading the repository and running things, not from memory. Where it says
something passes, that was observed, not assumed.

**Last verified:** 2026-08-26. Re-check section 3 before trusting it - it
describes an external system that can change without a commit.

---

## 1. What this product is

Mobile-first construction site reporting for site managers and subcontractors.

The whole product exists to serve one workflow:

> Stand on site, take ~10 photos, speak for ~60 seconds about the day's work,
> get a professional client-ready PDF report with minimal typing.

It is deliberately **not** a construction ERP. If a feature does not make that
one workflow faster, it does not belong in the MVP.

The user (repo owner) is a site manager, not a developer. Explain things plainly
and never assume they will debug on your behalf.

---

## 2. Current status

**Phase 1 of 7 is complete, tested, and pushed. Phase 2 has not been started.**

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Foundation, database, auth, app shell | **Done** |
| 2 | Projects CRUD + project detail tabs | **Next** |
| 3 | Report capture: details, workforce, plant, dictation | Not started |
| 4 | Photos: camera, upload, captions, before/after pairs | Not started |
| 5 | AI report generation + preview editor | Not started |
| 6 | Issues + PDF export | Not started |
| 7 | End-to-end polish | Not started |

### Git

- **Branch (only ever push here):** `claude/siteboss-pro-planning-8y80n2`
- **Base:** `main` - contains only unrelated legacy HTML, no app
- **PR #1** open, `mergeable_state: clean`, 6 commits, head `816ff63`
  https://github.com/mikeymcyo/pierwsze-koty-za-ploty/pull/1
- **No CI exists.** No `.github/workflows/`. Nothing runs the tests automatically.

### Commits so far

```
816ff63 Make the combined migration file strict ASCII SQL and validate on generation
29f36b1 Add a single-paste migration file for setting up a fresh Supabase project
3a9cb5e Accept Supabase's new publishable key alongside the legacy anon key
2851437 Use Vercel's stable branch URL for auth email links, and document deployment
84ff84e Make first-run local setup work without any secret credentials
0361569 Phase 1: foundation, database, authentication and app shell
```

---

## 3. Hosted Supabase project

The user has one, on the free tier. **This repository is public**, so its URL and
key are deliberately not written down here. Get them from `.env.local` if the
working copy has one (gitignored, so a fresh container will not), otherwise ask
the user for the Project URL and publishable key from Project Settings -> API.
Neither is a secret - the publishable key is designed to sit in a browser bundle
and RLS is what protects the data - but there is no reason to publish them.

**Migrations 1-3 ARE applied.** Verified by live probe: all ten tables return
HTTP 200 rather than 404. The user ran `supabase/apply-all-migrations.sql` in the
SQL Editor and got "Success. No rows returned".

**Migration 4 is also applied.** Verified: anonymous requests now return
`401 / 42501 permission denied` on every table instead of `200 []`.

**Outstanding: email confirmation is still ON.** Verified via
`GET /auth/v1/settings` -> `mailer_autoconfirm: false`. Consequences:

- `signUp` returns a user but **no session**, so the app shows "Check your
  inbox" instead of redirecting to the dashboard. That is correct behaviour,
  not a bug.
- `npm run test:e2e` against the hosted project **will fail** at the dashboard
  step until this is off. Do not misread that as a broken app.
- Only the user can change it: Authentication -> Sign In / Providers -> Email ->
  **Confirm email: off**.

Because of this, the authenticated read path has **not** been verified against
the hosted project - there is no way to obtain a session without confirming an
email. It is verified locally against identical migrations including the anon
revoke (both suites pass). Residual risk is low but non-zero; run both suites
against hosted once confirmation is off.

**You cannot apply migrations yourself.** The publishable key is anon-level and
cannot run DDL; that needs a Supabase access token or the database password,
neither of which should be requested into a chat transcript.

Note for when they paste SQL: they twice hit `syntax error at or near "Two"`
because they copied **the assistant's chat message** instead of the file. Point
them at the GitHub copy button and tell them the first line must be `-- ------`,
never an English sentence.

### The anon-grant finding (why migration 4 exists)

An anonymous request to the hosted project returns `200 []`, not "permission
denied" - so `anon` holds SELECT there. Locally it does not. The difference:
hosted Supabase has ALTER DEFAULT PRIVILEGES rules granting new public tables to
`anon`, and those apply to anything the **SQL Editor** creates, because it runs
as `postgres`. The CLI path does not hit this.

**No data is exposed.** Every policy in migration 2 is declared `to
authenticated` and `anon` has zero policies, so RLS returns no rows either way -
which is exactly why the probe shows empty arrays. The risk migration 4 closes
is a future one: a policy written without a role restriction would immediately be
anon-readable while that table grant remains.

---

## 4. Tech stack (exact, verified in package.json)

| Concern | Choice |
| ------- | ------ |
| Framework | Next.js **16.3.3**, App Router, Turbopack |
| React | 19.2.8 |
| Language | TypeScript strict |
| Styling | Tailwind CSS **v4** (`@theme` tokens in `app/globals.css`, no tailwind.config) |
| UI | Hand-written shadcn/ui-style primitives + Radix slot/label + lucide-react |
| Backend | Supabase (Postgres, Auth, Storage) via `@supabase/ssr` 0.12.5 |
| Validation | zod 4 |
| Tests | Playwright 1.56.1 (pinned exact) + psql-driven SQL tests |
| Host | Vercel (not yet connected) |

Not yet installed, needed later: OpenAI SDK (Phase 5),
`@react-pdf/renderer` (Phase 6).

---

## 5. Repository layout

```
app/
  (auth)/              login, signup, forgot-password, reset-password
    actions.ts         ALL auth server actions (signUp/signIn/signOut/reset)
  (app)/               authenticated area, wrapped by requireSessionContext()
    dashboard, projects, reports, reports/new, profile, loading.tsx
  auth/callback/       exchanges Supabase email codes for a session
  error.tsx, not-found.tsx, page.tsx (landing), layout.tsx, globals.css
components/
  ui/                  button card input label textarea select badge alert field empty-state
  nav/                 bottom-nav (mobile), side-nav (desktop), top-bar
  auth/                the four forms + submit-button
  brand/wordmark.tsx   text-based "SB" + SiteBoss Pro logo
  projects/status-badge.tsx
lib/
  env.ts               all env access, lazy getters, actionable errors
  supabase/            client.ts (browser), server.ts (RSC/actions), proxy.ts (session refresh)
  auth/session.ts      getSessionContext / requireSessionContext / displayName
  navigation.ts        NAV_ITEMS + isNavItemActive
  utils.ts             cn(), formatDate(), formatReportNumber()
proxy.ts               ROOT - route protection (see decision D2)
types/database.ts      hand-written Database type mirroring the schema
supabase/
  migrations/          4 files - THE SOURCE OF TRUTH
  apply-all-migrations.sql   GENERATED, do not edit
  tests/               00_supabase_stubs.sql, 01_rls_test.sql
scripts/               setup-local.sh, test-db.sh, build-combined-migration.sh
e2e/                   auth-smoke.mjs, isolation-smoke.mjs
docs/DEPLOYMENT.md     Vercel + hosted Supabase walkthrough
_legacy/               user's old unrelated HTML - leave alone
```

`AGENTS.md` (and `CLAUDE.md` which just includes it) is a **scaffold-generated
Next.js 16 rules file**. It instructs reading `node_modules/next/dist/docs/`
before writing Next code. Next 16 has real breaking changes - honour it.

---

## 6. Database

10 tables, 8 enums, across 4 migrations. Requires **PostgreSQL 15+**
(uses `ON DELETE SET NULL (column)`); every Supabase project qualifies.

```
companies, company_members, profiles
projects
reports -> report_sections, workforce_entries, plant_entries
photos, issues
```

Enums: `company_role, project_status, report_status, report_section_type,
photo_category, photo_pair_role, issue_priority, issue_status`

### Three security layers - do not weaken any of them

1. **RLS on every table**, resolving `company_id` through
   `public.is_company_member()`, which is `SECURITY DEFINER` so reading
   `company_members` inside a policy does not re-enter RLS and infinitely
   recurse. This is the classic Supabase multi-tenant trap.
2. **Composite foreign keys.** Children reference `(parent_id, company_id)`
   against a `unique (id, company_id)` on the parent, so a report can never
   point at a project in another company even if RLS were bypassed.
3. **Explicit GRANTs** in migration 2. See failure F1 - this is not optional.

### Triggers

- `on_auth_user_created` on `auth.users` - creates company + profile + owner
  membership. A user can therefore never exist without a company.
- `reports_assign_number` - gapless per-project report numbers under
  `pg_advisory_xact_lock`, so two supervisors cannot claim the same number.

### Storage

Two private buckets, `site-photos` and `report-pdfs`. Object paths are
`{company_id}/{project_id}/{filename}`; policies match the leading folder via
`public.storage_company_id()`, which returns NULL rather than raising on a
non-uuid path.

---

## 7. Key decisions and why

- **D1 - Light-only, high-contrast theme.** Used outdoors in sunlight. Dark mode
  was deliberately removed. Do not add it back.
- **D2 - `proxy.ts`, not `middleware.ts`.** Next.js 16 **deprecates**
  `middleware.ts`; having both is a hard build error. Verified in
  `node_modules/next/dist/build/index.js`.
- **D3 - `anon` role gets no privileges at all.** No anonymous data access
  anywhere. Migration 2 simply never grants to anon; migration 4 additionally
  revokes what hosted Supabase grants by default, and blocks future defaults.
  Verified that revoking anon does not break signup or login.
- **D4 - Both Supabase key names accepted.** `env.supabaseKey` reads
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` first, falling back to
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Supabase is mid-migration between formats.
- **D5 - `NEXT_PUBLIC_SITE_URL` must stay UNSET on Vercel.** `env.siteUrl`
  prefers `VERCEL_BRANCH_URL` (stable per branch) over `VERCEL_URL` (changes
  every deploy), so Supabase redirect URLs are configured once. See F3.
- **D6 - Unconfigured app redirects, never 500s.** With no Supabase env, every
  route except `/` redirects to the landing page, which explains setup.
- **D7 - `types/database.ts` is hand-written**, not generated - there was no live
  project to generate from. Once the schema is applied, regenerate with
  `npx supabase gen types typescript --project-id <ref> > types/database.ts`.
- **D8 - Native `<select>`** on purpose: OS picker wheels beat custom dropdowns
  with gloves on.
- **D9 - Raw dictated notes are stored verbatim** in `reports.raw_notes`
  alongside AI output, and `photos.original_caption` beside `caption`. The user
  must always be able to see what they actually said.

---

## 8. Failed approaches - do NOT repeat these

**F1 - Migration tables have no privileges by default.**
Postgres checks table-level `GRANT` *before* RLS. Tables created by a migration
carry no grants, so every query failed with `permission denied for table
projects`. The local SQL stub had a blanket `ALTER DEFAULT PRIVILEGES` that
**hid** this - real Supabase does not. Fixed by explicit grants in migration 2,
and the masking line was removed from `supabase/tests/00_supabase_stubs.sql` so
it can never hide it again. `service_role` needed the same treatment separately.
**If you add a table, you must add its grants.**

**F2 - The stub is not a substitute for real Supabase.**
`supabase/tests/00_supabase_stubs.sql` lets migrations run on plain Postgres, but
it caught neither half of F1. Always validate against a real Supabase database
before declaring schema work done.

**F3 - `VERCEL_URL` for auth email links.** Changes every deployment, so every
push would silently break password-reset links until re-allow-listed in Supabase.
Use `VERCEL_BRANCH_URL`.

**F4 - "There is Markdown in the SQL file."** There never was. Verified byte by
byte: zero `##`, zero backticks, zero escaped punctuation, pure 7-bit ASCII. The
user was copying the assistant's chat message. `scripts/build-combined-migration.sh`
now hard-fails on any of those patterns. Do not go looking for Markdown in the
SQL; look at what is being copied.

**F5 - Playwright tests racing the dev compiler.** A cold `next dev` compiles
routes on first request, which exceeded assertion timeouts and looked like a
broken app. `e2e/auth-smoke.mjs` now warms routes and uses a 60s
`COLD_COMPILE_TIMEOUT`. A failing e2e run is not automatically an app bug.

**F6 - Supabase cookie selector.** `name.includes("auth-token")` also matches the
`-code-verifier` cookies. Match `/^sb-.+-auth-token(\.\d+)?$/` and sort by chunk
index.

**F7 - `pkill -f "next dev"` kills your own shell**, because the pattern matches
the bash command line running it. Resolve PIDs first, then kill by number.

**F8 - Sandbox Docker needs ulimits capped.** `dockerd --default-ulimit
nofile=20000:20000`, and `npx supabase start -x realtime,storage-api,imgproxy,
mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` to skip the
container that fails on `rlimit type 7`. Only relevant inside this sandbox.

---

## 9. What is proven to work

All verified by execution, not inspection:

- `npm run build`, `npm run typecheck`, `npm run lint` - all clean.
- **Production build** (`next build` + `next start`) serves correctly: public
  routes 200, protected routes 307 to `/login`, zero console errors.
- **`npm run test:db`** - schema + RLS suite passes. It was deliberately
  sabotaged once to confirm it fails when RLS is broken, so it is not vacuous.
- **`npm run test:e2e`** - 23 checks: signup creates company via trigger,
  navigation, profile data, signout, signin, wrong password surfaces an error,
  server-side password validation, neutral password-reset response.
- **`npm run test:isolation`** - two companies; one cannot see the other's
  project through the UI *or* via a direct PostgREST call using their real
  session token.
- **`supabase/apply-all-migrations.sql`** applied as a single script to a virgin
  Supabase **PostgreSQL 17.6** with real auth/storage schemas: 10 tables,
  2 buckets, RLS on all 10, 42 policies, signup trigger present.
- **Migration 4** applied on top of an already-migrated database: anon drops to
  zero privileges, `authenticated` untouched, re-running is a no-op, and both
  the auth suite and the isolation suite still pass afterwards. Revoking anon
  does not break signup or login.

### Running tests

```bash
npm run setup:local          # needs Docker; starts Supabase, writes .env.local
npm run dev                  # separate terminal
npm run test:e2e
SUPABASE_SERVICE_ROLE_KEY=<from: npx supabase status> npm run test:isolation
npm run test:db              # needs a reachable PG 15+ via PG* env vars
```

In this sandbox Playwright needs
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

---

## 10. Known gaps and honest caveats

- **Empty-state copy is placeholder.** Dashboard and Projects say creation
  "arrives in the next build". Replace this in Phase 2 - it is not product copy.
- **No CI.** Three good test suites, nothing runs them. Adding a workflow
  (typecheck, lint, build, `test:db` against a `postgres:16` service container)
  was offered and not yet requested.
- **PR #1 description is user-generated and slightly wrong.** It claims seed data
  (none exists) and "generated" TypeScript types (they are hand-written, D7).
- **Team invites are out of MVP scope.** `company_members` is read-only from the
  client; the schema supports multi-user but there is no invite flow.
- **iOS Safari has no Web Speech API.** Phase 3 dictation must fall back to the
  keyboard microphone on iPhone. Design for it from the start.
- **The local Supabase stack is ephemeral** - it lives in this container and dies
  with it. Never treat local data as real.

---

## 11. Exact next steps

**Step 0 - finish hosted setup (needs the user).** All four migrations are
applied. The single remaining item is turning **Confirm email off** (section 3).
Once done, point `.env.local` at the hosted project and run `test:e2e` and
`test:isolation` against it - say first that this creates throwaway accounts in
their project, and note they cannot be deleted with the publishable key.

**Step 1 - Phase 2: Projects.** The user has said "Build Phase 2" is the next
build instruction. Scope:

- `app/(app)/projects/new/page.tsx` - create form. Fields already in the schema:
  name, client, site_address, postcode, project_reference, site_manager,
  start_date, expected_completion_date, description, status.
- `app/(app)/projects/[id]/page.tsx` - detail page with four tabs:
  **Overview / Reports / Photos / Open Issues**. Reports, Photos and Issues get
  real empty states now and real content in Phases 3, 4 and 6.
- `app/(app)/projects/[id]/edit/page.tsx`.
- `app/(app)/projects/actions.ts` - server actions, zod-validated, mirroring the
  shape of `app/(auth)/actions.ts`.
- Wire the dashboard's "Create New Project" path and replace the placeholder
  empty-state copy.
- Extend `e2e/` to cover create -> appears in list -> edit -> appears on
  dashboard, and confirm the isolation test still holds with real projects.

Reference project the user cares about, useful as test data:
Lidl South Croydon - External Works / Lidl GB / South Croydon / ref 1470 /
site manager Maciej / Active.

**Step 2 - deployment**, only once Step 0 is done. `docs/DEPLOYMENT.md` is
complete and accurate. The user must connect Vercel themselves via the Git
integration - do not request a Vercel token.

---

## 12. Working agreements with this user

- Push only to `claude/siteboss-pro-planning-8y80n2`. Never to `main`.
- Never commit secrets. `.env.local` is gitignored; scan staged diffs for the
  real project ref and key before committing.
- Do not ask for Vercel tokens, Supabase access tokens, or database passwords.
  Recommend UI flows instead and say why.
- Verify claims by running things. This project has repeatedly found real bugs
  (F1 especially) precisely because assertions were tested rather than assumed.
- Do not leave non-functional UI. If a feature is not built, say so in the UI
  rather than shipping a dead button.
- The `service_role` / `sb_secret_...` key must never appear in a
  `NEXT_PUBLIC_*` variable or reach the browser.
