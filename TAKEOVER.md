# SiteBoss Pro - Codex takeover

## Takeover verification - 27 October 2026

The owner confirmed Claude has stopped and authorised Codex to take over.
Development continues on `codex/open-jobs-finish`, based on
`feature/open-jobs` at `be07772`, itself one commit after `c406bda`.
Do not treat the historical head/date below as the current release.

- GitHub records a successful **Production** deployment of `c406bda` on
  16 October, and a successful **Preview** of `be07772` on 27 October.
  `https://app.sitebosspro.co.uk` returns HTTP 200. No alias or production
  setting has been changed during this takeover.
- Open Jobs already has priority groups, maps, Done/Reopen and PO PDFs.
  It does **not** yet have CSV import, a calendar or CAR anomaly detection.
  Reuse this module if those are commissioned; do not build a second planner.
- This finish pass checks the selected PDF's signature and 25 MB limit,
  binds each upload to its company/job/PO, verifies the storage object before
  recording it and guards replacement against a stale screen or concurrent
  write. A failed update never removes the old PDF. Inline PDFs are not
  cached, and imported PO text is made safe for a response filename.
  PO read failures render the existing load-error panel. Job reads, status
  writes and PDF reads are explicitly scoped to the active company as well
  as protected by RLS.
- `test:job-po-files` executes the real attachment helper with injected
  storage/write failures and concurrent changes (17 checks). Open Jobs,
  photo replacement, Capture Composer and presentation round-trip checks,
  lint, typecheck and the production build pass. A clean checkout needs
  `next typegen` or a build before typecheck generates `LayoutProps`.
- The existing jobs migration and seed have **not** been applied or
  verified against hosted Supabase in this session. No hosted data was
  written. Authenticated Open Jobs behaviour, tenant isolation against the
  database and the physical iPhone workflow remain acceptance requirements.
- The ordinary photo uploader, Replace Photo and Capture Composer are
  unchanged. No Empire system was accessed. Production stays untouched
  until the owner approves the preview on a physical iPhone.

