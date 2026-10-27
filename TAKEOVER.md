# SiteBoss Pro - Codex takeover

## Takeover verification - 27 October 2026

The owner confirmed Claude has stopped and authorised Codex to take over.
Development continues on `codex/open-jobs-finish`, based on
`feature/open-jobs` at `be07772`, itself one commit after `c406bda`.
The historical HANDOFF.md head/date is not the current release.

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
- On 27 October, after explicit owner approval, the jobs migration and seed
  were applied together in one transaction through the authenticated Supabase
  SQL editor. Migration history records version `20261026000014`, name
  `jobs`. The approved company and owner were checked before writing.
  Verified: 13 jobs, 16 PO records, private PDF-only bucket with a 25 MB limit,
  RLS enabled on both tables, full authenticated CRUD privileges and no anon
  privileges. Under the owner's authenticated claims all 13 jobs/16 POs were
  visible; under a non-member's claims both counts were zero.
  Preview and Production share this database. No app promotion was performed.
  Authenticated browser behaviour, actual PO PDF upload/replacement and the
  physical iPhone workflow remain acceptance requirements.
- The ordinary photo uploader, Replace Photo and Capture Composer are
  unchanged. No Empire system was accessed. Production stays untouched
  until the owner approves the preview on a physical iPhone.

