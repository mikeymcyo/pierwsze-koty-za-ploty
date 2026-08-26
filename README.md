# SiteBoss Pro

Mobile-first construction site reporting. Photograph the site, speak for a minute,
and get a professional, client-ready progress report as a PDF.

> **Status: Phase 1 complete.** Authentication, the multi-tenant database with Row
> Level Security, the design system and the app shell are built and tested.
> Projects, report capture, photos, AI generation and PDF export follow in
> Phases 2–7.

## Stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Turbopack), React 19         |
| Language       | TypeScript, `strict`                                 |
| Styling        | Tailwind CSS v4 with `@theme` design tokens          |
| UI             | shadcn/ui-style primitives in `components/ui`        |
| Auth, DB, files| Supabase (Postgres 15+, Auth, Storage)               |
| Hosting        | Vercel                                               |

## Getting started

You need Node.js 20+ and a Supabase project (the free tier is fine).

### 1. Install

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API** in the Supabase dashboard. Until these are set, the
app runs but shows setup instructions instead of the sign-in screen.

### 3. Apply the database migrations

Either paste each file in `supabase/migrations/` into the Supabase SQL editor in
filename order, or use the CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This creates every table, the enums, the Row Level Security policies, the two
private storage buckets, and the triggers that give each new user a company and
number reports sequentially.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000.

### Working fully locally

The Supabase CLI runs the whole stack on your machine, which is the fastest way
to develop:

```bash
npx supabase start          # applies supabase/migrations automatically
```

Put the printed `API URL` and `anon key` into `.env.local`. `npx supabase db reset`
reapplies every migration from scratch.

## Scripts

| Command                  | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `npm run dev`            | Development server                                          |
| `npm run build`          | Production build (also type-checks)                         |
| `npm run typecheck`      | `tsc --noEmit`                                              |
| `npm run lint`           | ESLint                                                      |
| `npm run test:db`        | Applies migrations to a throwaway database and runs the schema/RLS tests |
| `npm run test:e2e`       | Browser test of the sign-up, sign-in and navigation flows   |
| `npm run test:isolation` | Proves one company cannot see another's data                |

`test:db` needs a reachable PostgreSQL 15+ and the standard `PG*` environment
variables. `test:e2e` and `test:isolation` need `npm run dev` and a local
Supabase running; the isolation test also needs
`SUPABASE_SERVICE_ROLE_KEY` (from `npx supabase status`) to plant its fixture.

## How the data is kept separate

Every user belongs to a **company**, created for them by a database trigger at
signup so an account can never exist without one. Every table carries a
`company_id`, and every RLS policy resolves it through
`public.is_company_member()`. Two further safeguards sit underneath:

- **Composite foreign keys.** Child rows reference `(parent_id, company_id)`
  together, so a report can never point at a project in a different company —
  enforced by Postgres even if RLS were bypassed.
- **Explicit grants.** Tables created by a migration carry no privileges of
  their own, so the migrations grant them deliberately: `authenticated` gets
  row-level access, `anon` gets nothing at all.

`supabase/tests/01_rls_test.sql` asserts all of this, including that a second
user sees zero rows, cannot write into another company, and cannot store a file
outside their own storage folder.

## Project layout

```
app/
  (auth)/           Sign in, sign up, password reset, and their server actions
  (app)/            Everything behind a session: dashboard, projects, reports, profile
  auth/callback/    Exchanges Supabase email links for a session
components/
  ui/               Button, Input, Card, Badge, Alert, Field, Select, EmptyState
  nav/              Bottom bar (mobile), sidebar (desktop), top bar
  auth/             The four authentication forms
  brand/            SiteBoss Pro wordmark
lib/
  supabase/         Browser, server and proxy clients
  auth/session.ts   Resolves the signed-in user and their company
  env.ts            Environment access with actionable error messages
supabase/
  migrations/       Schema, RLS, storage — apply in filename order
  tests/            Schema and RLS test suite
e2e/                Browser tests
```

Route protection lives in `proxy.ts` (Next.js 16's replacement for
`middleware.ts`), which also refreshes the Supabase session on every request.

## Design

The interface is deliberately light-only and high contrast: it is used outdoors,
on phones, in direct sunlight. Touch targets are at least 48px so they work with
gloves on. Primary actions are near-black for maximum contrast, with a single
high-vis amber reserved for the wordmark and the create action.

## Deploying to Vercel

1. Import the repository.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` (your deployed origin).
3. In Supabase, add `https://<your-domain>/auth/callback` to
   **Authentication → URL Configuration → Redirect URLs**.

## Roadmap

| Phase | Scope                                                  |
| ----- | ------------------------------------------------------ |
| 1 ✅  | Foundation, database, auth, app shell                   |
| 2     | Projects CRUD and the project detail tabs               |
| 3     | Report capture: details, workforce, plant, dictation    |
| 4     | Photos: camera, upload, captions, before/after pairs    |
| 5     | AI report generation and the preview editor             |
| 6     | Issues and the PDF export                               |
| 7     | End-to-end polish                                       |
