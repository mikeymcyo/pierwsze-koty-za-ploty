# SiteBoss Pro - Handoff

For a Claude Code session with no prior context. Every claim here was checked
against the repository or by running something. Where something is unverified,
it says so explicitly - treat that distinction as load-bearing.

**Written:** 2026-08-26 · **Last updated:** 2026-08-31

**Branch:** `claude/siteboss-pro-react-441-diagnosis-bhvwk8`
**Recovery head:** `fe6bf7f` - AI photo descriptions and supporting documents

## Current state - read this before the historical sections below

This block supersedes the old statements later in this file that Phase 6 has
not started, that an issued report cannot be edited, and that migration
`000005` is outstanding. All three are wrong now.

Issues and the Daily Report PDF were completed in `5047110`. The
Progress/Completion schema followed in `a632c4f`, with the tenant-key fix and
durable PostgreSQL suite in `6d3f554`, and the workflow itself in `26409e3`.
The report lifecycle landed in **`00a3bfb`**.

The current implementation completes the core workflow:

- Progress Reports consolidate final Daily Reports for a fixed date range.
- Completion Reports prefer issued Progress Reports while retaining every
  underlying Daily Report as provenance, without feeding it to the writer
  twice.
- Both kinds have evidence-grounded AI drafting, protected manual edits,
  curated photographs and issues, draft PDF previews and stored issued PDFs.
- Closing an issue now requires a recorded resolution. Finalising a summary
  snapshots its issue status and resolution.
- Reports, Project detail and Dashboard list all three document types.



### Arranging is dnd-kit, in a view of its own

The hand-written long-press drag felt wrong on a real iPhone, so it is gone.
`components/reports/photo-arrange.tsx` is a dedicated full-screen arrange view
built on **@dnd-kit** - a lifted `DragOverlay` that follows the finger,
neighbours that move aside to show where the photograph lands, auto-scroll at
the edges, and a keyboard sensor. One implementation, opened by the same
`PhotoOrderBar` from the daily grid and the consolidated list.

`usePhotoOrder` is unchanged and still owns the order, the debounce and the
save, so nothing about `sort_order`, `isSameSet` or the refusal on an issued
report moved.

**The sensor split is load-bearing.** `MouseSensor` (distance 8) plus
`TouchSensor` (delay 200ms, tolerance 8) rather than the single `PointerSensor`
that covers both: a pointer sensor also receives touch, so it claims the
gesture before the hold can be judged - a press-and-hold then does nothing and
a swipe starts a drag the browser immediately cancels. This was found by
driving the real component in a 390px browser, and the test asserts the two
sensors stay separate.

**Order is sequence, and nothing else.** `PLATES_PER_ROW` and `sharesRow` are
deleted along with the "Prints beside P01" wording. That was a promise this
layer could not keep: how many plates go on a row is the document's decision,
and it is free to put one, two or four there. The PDF is untouched and stays
free to change its density without making the screen a liar.

No migration. No rotation. `npm run test:photo-order`.

### Photographs are arranged by dragging them

The arrows in `578d3f4` worked and were slow: putting plate eleven next to
plate two was nine taps. They are replaced by press-and-hold drag, in the same
module - `usePhotoDrag` sits beside `usePhotoOrder` in
`components/reports/photo-reorder.tsx`, and the daily grid and the consolidated
list both compose it, so there is still one reorder control rather than two.

Four things make it work on a phone, and each was a way to fail:

- **A hold, not a contact.** 200ms, and more than 10px of travel before that
  hands the gesture back to the page - the whole screen is photographs, so
  every scroll starts on one.
- **`setPointerCapture` on the grid**, or a fast drag loses its target halfway
  across.
- **The scroll lock is a native `touchmove` listener registered
  `{ passive: false }`.** React attaches its own touch listeners passively, so
  `preventDefault` inside `onTouchMove` is ignored and the page scrolls out
  from under the drag. Bound only while a drag is running.
- **`elementFromPoint` on every move**, not rectangles measured at the start:
  the tiles reflow as the order changes under the finger. The lifted tile stops
  taking pointer events so the hit test sees what is beneath it.

One set of listeners on the grid rather than a closure per tile - which is also
what keeps `react-hooks/refs` happy, since nothing is computed from a ref
during render. **Arrow keys still move a plate**, so a keyboard is not shut out
by a gesture. No dependency was added. `usePhotoOrder`, its debounce, the
one-based `sort_order`, the `isSameSet` guard and the refusal on an issued
report are all unchanged.

**No migration.** `npm run test:photo-order` covers the gesture's contract.

### Rotation: the proposal, not applied

Rotating a photograph has nowhere to be stored. `photos` carries `width`,
`height` and no orientation, and re-encoding the stored object is out - it is
the evidence. So it needs a migration, and the instruction was to stop and
report first. The smallest safe approach:

```sql
alter table public.photos
  add column rotation smallint not null default 0
  check (rotation in (0, 90, 180, 270));
```

Additive, one column, nothing rewritten; every existing row reads 0 and looks
exactly as it does today. Then:

- **Screens**: `rotate(Ndeg)` on the thumbnail inside its existing square
  frame. Cheap and exact.
- **PDF**: the risky half. `@react-pdf/renderer` has limited `transform`
  support, and a quarter turn also swaps the plate's aspect ratio, so
  `lib/pdf/image-size.ts` and `photoBoxSize` must swap width and height for odd
  turns. This wants proving against a rendered PDF before it is trusted -
  `test:pdf-template` already measures page counts and plate boxes, which is
  where that proof belongs.
- **Issued reports**: refuse the write when the owning report is final, the
  rule every other photo write already uses. Stored PDFs are files and are
  never re-rendered, so nothing historical moves.
- **Caption, status and AI description** are columns on the same row and follow
  the photograph without being touched.

### Standalone Completion, free dates, one fact one section, and photo order

**A Completion Report can be written directly.** It was the last document that
demanded a source, on the reasoning that a consolidation with nothing behind it
is a claim rather than a record. But a job can finish without a Daily Report
ever having been filed - a short fit-out, a job taken over part-built, work
reported nightly by phone - and refusing to issue that job's completion
document does not make the job less finished. Both gates are gone: the create
form offers the same two modes it offered a Progress Report, and
`canFinaliseSummary` no longer asks any kind for a source. What made the rule
unnecessary is that the absence was already stated rather than hidden - no
source record in the PDF, a screen that says the report has none, and a
provenance instruction forbidding the model to claim one. `provenance.ts` was
already kind-agnostic and did not change.

**The reporting period is optional on every kind.** The Progress-only
`superRefine` and the `required` inputs are gone. Blank means blank - no date
is invented. A consolidating report with no dates takes every final Daily
Report on the project, which is what the existing filter already did with a
null bound. `summaryPeriodLabel` now says **"Period not stated"** for a Progress
Report with no period rather than "Whole project record", which is a Completion
Report's phrase and would be claiming a scope nobody entered.

**Outstanding items and Planned works are no longer two chances to say one
thing.** The briefs were distinct in intent but nothing forbade the repeat, so
one activity could appear in both. The line is now drawn by who the work waits
on - Outstanding is what we are waiting on somebody else for, Planned is what
is ours to schedule - and an item that is both is written **once, under
Outstanding, with its timing carried into the sentence**. The rule is in the
daily briefs, the system prompt and the cleanup briefs, with a worked example,
and it explicitly refuses the two cheap ways out: dropping the timing, and
hedging what the notes said. Thirteen assertions in `test:section-roles`.

**Photographs can be put in order.** `photos.sort_order` has existed since the
first migration and nothing ever wrote it, so every row carried `0` and the
lists fell back to `created_at` - upload order, by accident. `Reorder` on the
photo section turns the grid into a mode where each tile shows the plate number
it will print as (P01, P02 …) and two large arrows move it one place. Arrows
rather than a drag: a long-press drag fights iOS's own scrolling, and fifteen
photographs is a lot of dragging one-handed. Moves are debounced and written by
`reorderReportPhotos`, which writes **only** `sort_order`, validates the
submitted list against what the report actually holds, and refuses an issued
report. `lib/photos-order.ts` holds the rules, including which plates share a
row - the PDF prints two to a row in the given order, so a before and an after
placed together print side by side, and the screen says so. Positions are
one-based so a saved order is never confused with the unordered `0`. No
migration: the column was already there.

A follow-up extended the same control to Progress, Completion and Survey.
`summary_report_photos.sort_order` already existed and was already written on
insert and read in order by the PDF; what was missing was the screen. The
state, the debounce, the arrows and the wording moved into
`components/reports/photo-reorder.tsx` so there is one control rather than two,
and `reorderSummaryPhotos` writes the link's `sort_order` - never the
photograph, which may be in a Daily Report and a Progress Report at once with a
different position in each. A report that curates by ticking boxes gets the
same list with the camera and the remove taken off (`manage={false}`): the
curation form still owns which photographs are in, and this owns the order.
The report screen now reads its links ordered, which it did not before, so the
plate references it was already showing are the PDF's.

### A small UX and account batch

Three things that were each one screen's worth of friction.

**A report list now says when.** The report date does not give chronology -
two reports can carry the same date, and one dated Monday may have been
written on Monday evening and issued on Wednesday. `lib/reports/timing.ts`
composes "Created 25 Aug, 14:32 · Issued 17:05" and
`components/reports/report-timing.tsx` puts it on the badge's own line in both
list rows, so knowing the chronology costs the row no height. The date is
dropped from the issued half on the same day, and the year appears only on a
report that is not from this one. Read in UK time, not the server's UTC, so a
report filed at half past midnight in the summer is not shown on the day
before. `npm run test:timing`.

**Settings can always be left.** The gear now carries the screen it was tapped
on (`/profile?from=/reports/abc`) and Settings offers "Back to Reports" at the
top. Deliberately not `history.back()`: history holds redirects and form posts
and is not ours to reason about, and a home-screen web app may have no back
gesture at all. `safeReturnPath` refuses anything that could point off this
origin, and an arrival with no `from` still gets a control - back to the
Dashboard. `lib/navigation.ts` owns all of it.

**The company name is editable, by its owner.** No migration: the
`companies_update_owners` policy and the `update` grant have been there since
`20260826000002`, unused. `app/(app)/profile/actions.ts` writes the one row and
touches nothing else. It reaches new documents for free - every renderer reads
`session.companyName` at the moment it draws - and reaches no issued one,
because those are stored bytes that are never re-rendered. The screen says so
above the field rather than after the fact. A member sees the name and who can
change it, not a control that would be refused. `npm run test:settings` covers
the rules and guards that the action never names the PDF bucket.

### The report reader is now a full-screen one that draws the pages

`00a3bfb` gave the PDF a way out - Back, inside the app, instead of a new tab
somebody had to close the browser to escape. That fixed the way out but not the
reading, and it was confirmed on an **iPad**. On an **iPhone** the document
still could not be read, and the owner was again exporting reports into Files
just to inspect them.

The cause is F24: **iOS Safari will not display a PDF in an `<iframe>`.** It
draws one non-scrolling preview of page one. The frame was 70dvh of page one
and no way to reach page two.

`components/pdf/pdf-viewer.tsx` now draws the pages itself, with pdf.js, onto
canvases in one continuous scroll, filling the screen over the app shell -
Close on the left, Share PDF on the right, both in the top safe area, and a
magnifier pinned bottom-right. Same component, same props, same two routes
(`/reports/[id]/pdf`, `/summary-reports/[id]/pdf`), so Daily, Progress,
Completion and Site Survey all got it at once. "Open full screen" is gone from
the header: handing the file to Safari is the trap this screen replaces, and it
survives only as the way out of a failed render.

`lib/pdf/viewer-source.ts` now decides which bytes the reader is handed, and
both viewer pages call it instead of working it out twice. An issued report
reads `[id]/file` - the stored object, same-origin - and a draft reads
`[id]/preview`. A reopened report still shows the PDF its client holds unless
`?draft=1` asks for the corrections. The reader carries no renderer, so an
issued PDF cannot be regenerated by looking at it. `npm run test:viewer` holds
that rule, including that `?draft=1` cannot turn a final report into a render.

The issued source moved from a signed storage URL to the same-origin route
because pdf.js has to fetch the bytes to draw them, and a signed URL is on
another origin and expires ten minutes after the page rendered - which is a
plausible length of time to spend reading a report.

### A photograph's status is opted into, not assigned

Printing was fixed once - `photoPrintLabel` has always dropped a status that
says nothing - but capture was not. Every upload was tagged `progress` unless
somebody changed the menu, so twenty-five ordinary site photographs arrived
carrying twenty-five DURING labels nobody had chosen.

**New photographs now start with no status at all.** A status appears, on
screen and in the PDF, only where a person picked one.

- The menu reads **No status** (first, and the default), Before, During, After,
  Defect, Delivery. The label above it says "Status (optional)".
- **No migration.** "No status" is the enum's existing `general`, which has
  always been the value that prints nothing - it is simply named for what it
  does. Nothing stored changes meaning, every old `progress` photograph still
  says During, and `work_completed` / `safety` still print their own words.
- Two helpers in `lib/photo-captions.ts` are now the only way a status reaches
  a screen: `photoStatusLabel` (null where none was chosen) and
  `photoPickerLabel` (caption, status, or a fallback name). Every screen that
  used to index `PHOTO_CATEGORY_LABELS` directly - the grid, the photo
  workspace, the curation picker, the daily, project and issue screens - goes
  through them, and the test asserts none of them indexes a label map again.
- **The AI is told null** where nothing was chosen, so captioning neither
  depends on a status nor invents a classification.
- Issued PDFs are stored files and are not re-rendered, so nothing historical
  changes.

One deliberate exception: **a survey still starts on Before**, because it
records what is there before anybody has worked. That decision now lives on the
summary page rather than inside `ReportPhotos`, which also serves a Progress
Report written directly - and that has no reason to mark its photographs at
all.

### The hurricane rule: describe, photograph, draft, review, done

Authoring is now shaped by how a document is actually made, not by how many
sections it stores. `authoringMode(kind)` in `lib/report-structure.ts` decides
it, and both screens read the same answer.

**Daily - `notes`.** One writing window: the dictation box. The drafted
sections appear as prose beneath it, and the editor waits behind **"Edit the
written report"**. No Works completed / In progress / Planned works boxes on
the screen at all. The order is the workflow: describe → Photos & Evidence →
Write my report → Master AI Review → Preview / Finalise / Share. Issues keep
their existing collapsed "Raise an issue" control.

The disclosure is offered once there is something to correct - **or straight
away where `OPENAI_API_KEY` is not set**, because then it is the only way to
write the report at all. That branch is asserted; without it a deployment with
no AI would have a daily report that cannot be written.

**Progress and Survey - `sections`.** Two writing areas, each with a visible
Dictate button: Progress Overview / Outstanding-Next Actions, and Findings /
Recommendations. There is no notes box on a consolidated document, so its
sections are the writing surface and stay in front of the user.

**Completion - `sections`, three areas.** It is the final project record and
keeps a little more structure. Still no admin-heavy presentation.

**Inside one writing area, only the first part is in front of you.** A Progress
Overview drafted into five parts used to show five labelled fields, which is a
pile of sub-section editors whatever the surface around it looks like. The rest
fold behind one line naming them: *"Also in this section: Works completed,
Works in progress, Resources and plant"*.

**The folded fields stay in the form, and that is load-bearing.** `<details>`
keeps its children in the document, so the browser posts them. A conditional
render would post nothing for those sections, `readGroupFields` would read them
as empty, and saving one part would silently clear the others.
`e2e/report-structure-smoke.mjs` §12 asserts the fold is conditional only on
there being something to fold, and §9 still proves no edit can move prose
between statuses - the boundary is the field name, which nothing on the screen
can type over.

No migration. Issued reports, stored sections, the PDF, AI Cleanup, the Master
AI Review, provenance and every H&S safeguard are untouched.

### One writing box per section, and no Save button under a photograph

The tester's four findings from the iPad screenshots, fixed together.

**1. One writing area per visible section, with boundaries a person cannot
edit.** Grouping the headings was not enough: a Progress Report still put five
textareas on the screen. Each visible section now has ONE surface - one border,
one Dictate button, one Save.

**The section boundaries are form field names, not text.** Inside that surface
each stored section has its own field, `section:<type>`, and the part names
between them are a `<span>` - page furniture, not a line in a box. Text is
saved to the section whose field it was typed into and to no other. Nothing is
parsed out of prose.

That is the second design. The first separated a group's sections with their
names on a line inside one textarea and split the text back apart on save, and
the tester was right to stop it: deleting that line - easy one-handed on a
phone - silently moved next Monday's planned works into last Friday's completed
works. A status nobody changed, in a document read back in a dispute.
`e2e/report-structure-smoke.mjs` §9 proves the replacement: typing "Works
completed" into the planned-works field leaves every word in planned works;
clearing one part clears that part only; a field for a section outside the
group is ignored; and whitespace is not an edit.

**No migration, and the stored model is untouched** - the drafting and cleanup
prompts still write each section, the Master AI Review still reasons about them
one at a time, and the PDF still prints each with its run-in label. **Only a
section whose own text moved is marked as edited by a person**, so one edit
does not exempt the whole group from the next regeneration. Which parts get a
box: the ones already written, or - where nothing is written - the first, so
there is always somewhere to start. Never all eight. A group with no written
sections at all (Photos & Evidence everywhere but a Completion Report) gets no
box.

The per-section editors and the `updateSection` / `updateSummarySection`
actions behind them are gone; `updateSectionGroup` and
`updateSummarySectionGroup` replace them.

**2. Progress dictates.** The surface uses `useSpeechInput` - the one
implementation of dictation, shared with `DictationField`; `SpeechRecognition`
appears in `lib/hooks/use-speech-input.ts` and nowhere else, and the test
asserts it. Speech goes into the part currently being written in, and says so
while listening. Every kind and both Progress modes (source-based and
standalone) get it. On a standalone Progress Report the dictated text is also
what the AI reads as evidence, which is the existing standalone behaviour.

**3. Photo captions describe evidence, not pictures.** The prompt produced "an
operative standing on a mobile scaffold tower reaching towards a dome camera" -
accurate about a picture and worthless in a report. It now leads with *say why
the photograph was taken*, carries five bad/good pairs (including the owner's
fire-stopping one), and tells the model to name a document by type and say it
was displayed or referenced - never what it authorises. `describePhotoAction`
also passes **what the report's own sections already say**, so a caption can
use the report's terms. Every "never state" rule is unchanged and still
asserted, plus new ones for permits and briefings.

**4. No Save button under a photograph.** Twelve plates carried twelve of them,
and a caption typed and scrolled past was a caption lost. The caption now saves
~900ms after typing stops, on blur, immediately when the status changes, and
immediately when an AI suggestion is accepted - "Use it" applies **and**
persists. A save that would change nothing is not sent (`savedRef`), and the
accept path flushes through an effect rather than from inside the click
handler, because a controlled textarea has not re-rendered yet at that point.
Server-side rules are untouched: an issued report still refuses the write.

Tests: `npm run test:report-structure` covers the round trip and the box count;
`npm run test:photo-ai` covers the prompt and the autosave wiring.

### Three visible sections, everywhere

A Daily Report showed nineteen headings on screen and printed thirteen in the
PDF. That is an admin system, not something a site manager reads on a phone in
the rain. Every document now shows **three**, on screen and in the PDF alike:

| | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Daily | Daily Summary | Photos & Evidence | Issues / Next Steps |
| Progress | Progress Overview | Photos & Evidence | Outstanding / Next Actions |
| Survey | Findings | Photos & Evidence | Recommendations |
| Completion | Completion Summary | Photos & Evidence | Outstanding / Sign-off |

**`lib/report-structure.ts` is the whole idea.** It maps each stored section
type to one of three groups per document kind, and both screens and both PDF
documents read it. Presentation only:

- **No section type was removed, merged or renamed. No migration.** A daily
  still stores eight sections, a progress report seven, a completion report
  eight, a survey seven - `e2e/report-structure-smoke.mjs` fails if any of
  those shrink. The fine-grained sections are what keep the writing honest: the
  cleanup and drafting prompts allocate one fact to one section, the
  section-role rules stop Summary and Works completed saying the same thing
  twice, and the Master AI Review reasons about them one at a time. Collapsing
  them in the database would have undone all of it.
- **Every stored section still has its name on the page**, as a bold run-in
  label opening its own paragraph - "Works completed. Ducting was laid…" -
  rather than a heading block. The difference between work recorded as
  completed and work recorded as planned is what a dispute turns on, so it
  survives the tidying. A group holding one section does not repeat its own
  heading.
- **Not one stored section may be unmapped.** The test asserts it for all four
  documents: an unmapped type would be written, saved, and then silently
  missing from the PDF that goes to a client. `groupSections` also appends an
  unknown type to the last group rather than dropping it, as a second line of
  defence.

**Where the recorded data went.** Nothing was deleted:

- **PDF**: one *"Appendix - record data"* after the three sections, carrying
  workforce, plant, the document register and the source record. What it holds
  is listed on the heading's own line - a paragraph under the heading cost a
  one-page progress report a second page, which is the opposite of the point.
- **Screens**: behind an `Advanced details` disclosure inside the section it
  belongs to. The date, weather, workforce and plant sit inside the capture
  form, *after* the dictation box - the notes are what somebody came to do.
  Supporting documents sit behind their own disclosure in Photos & Evidence.

**Page budgets held.** `test:pdf-template` measures them: bare daily 1, daily
with a photo 1, three issues 1, full daily 2, twelve photographs 3, progress 1,
completion 2 - all equal to or better than before.

Also improved in passing: an **issued Daily Report now shows its written
sections on screen**. It never did - only the PDF carried them, so checking
what went out meant opening the document.

Components: `components/reports/report-section-card.tsx` (`ReportSectionCard`,
`ReadOnlySection`), and `lib/pdf/components.tsx` gained `GroupedProse`.
`ReportDraft` split into `ReportWriter` + `ReportSectionEditors`, and
`SummaryDraft` into `SummaryWriter` + `SummarySectionEditors`, so the write
button stays one control while its sections are placed under the headings they
belong to.

Tests: `npm run test:report-structure`. All 26 dependency-free suites pass.

### The Cleanup AI pass, before anything else

There are now **three AI layers**, in this order, and they are deliberately
separate documents in the code:

```
raw / voice notes
  -> CLEANUP AI              lib/ai/cleanup.ts, lib/ai/cleanup-prompt.ts
  -> section drafting        lib/ai/prompt.ts, lib/ai/summary-prompt.ts
  -> the assembled report
  -> MASTER AI REVIEW        lib/ai/master-review-prompt.ts - later, untouched
```

**The Master AI Review is not replaced and not merged into anything.** It still
reads the assembled document afterwards, still proposes changes a person ticks
before a word is saved, and its prompt has never heard of a cleanup pass -
`e2e/cleanup-smoke.mjs` fails if that changes.

The Cleanup AI's only job is language: it rewrites raw or dictated material into
concise British construction-report English under one hard-coded UK glossary
(`lib/ai/glossary.ts`), puts each item under the section whose status it
actually has, and moves no fact and no status. Five upgrades that look like
synonyms are named and forbidden - proposed to instructed, observed to
confirmed, installed to tested, completed to approved, work to compliant or
safe - and work described in the future never comes back as work completed.

Wired for all four documents: **Daily**, **Progress**, **Completion** and
**Survey**, the last three through the same summary action.

Points that are load-bearing:

- **Nothing cleanup produces is stored.** It is an input to the drafting pass,
  which is what writes `report_sections` / `summary_report_sections`. So
  hand-written text protection is untouched: `partitionDraft` still keeps every
  `ai_generated = false` section off limits, and cleanup never gets near one.
- **A failed cleanup is not an error.** `cleanedSectionsFor` returns an empty
  list and the pipeline behaves exactly as it did before this layer existed.
- **The raw notes still reach drafting last and verbatim**, so the cleaned draft
  can always be checked against what was actually said. Drafting is told the
  draft is "proposed wording only - not evidence, and not a source of fact".
- **The glossary is hard-coded and stays that way.** Configurable per-company
  glossaries were explicitly not built. If they ever are, `STATUS_ESCALATIONS`
  and `NOT_UNLESS_SOURCED` must stay out of what can be configured - a company
  that can rename "observed" to "confirmed" defeats the layer.
- **Period summary asks for three sentences and nothing enforces that by
  cutting.** An earlier version capped it in code and dropped the fourth
  sentence; that is gone. The fourth sentence can be the only place a fact
  appears, and deleting a fact from a contractual record is a worse fault than a
  summary one sentence too long. **Fact preservation outranks brevity**, and the
  model is told so in those words. An overrun is logged by
  `overLongSections` and left in full - if it keeps happening, fix the prompt,
  never the output.
- **Photograph vs drawing comes only from metadata** (`lib/ai/cleanup-context.ts`).
  A row in `photos` is a photograph; a document is a drawing only where its
  recorded `doc_type` is `drawing`, and any other document is named by its own
  type. Document metadata is resolved snapshot-first, exactly as
  `lib/reports/review-context.ts` resolves it, so cleanup and the Master AI
  Review never disagree about which revision a report was issued against.
- **No migration.** Nothing in this layer touches the schema.
- **Cost and latency doubled per draft** - two model calls where there was one.
  `OPENAI_CLEANUP_MODEL` exists so cleanup can run on a cheaper model.

Fixed in passing: `lib/ai/summary-generation.ts` told the model a **survey** was
a `COMPLETION REPORT`, because the document line was a two-way ternary. It now
reads `SUMMARY_KIND_LABELS`, so a survey is announced as a Site Survey - the one
thing a survey must never be told it is.

Tests: `npm run test:cleanup` - no key, no database, no dev server: the prompt
contract for all four kinds, proof that a four- or five-sentence period summary
comes back whole, the packaging stripper, and a real HTTP round-trip to the stub
through the same request builder and parser the app calls. `npm run test:ai` additionally proves both
passes run in order against a live app; it needs Supabase and a dev server and
has **not** been run in this sandbox.

### Progress Reports can be written directly - no Daily Reports required

The old rule ("there are no final Daily Reports in that period yet") blocked a
real week: the site manager is not on site, operatives send updates and
photographs by WhatsApp, and the client still wants a Progress Report. **No
migration - a report either has source rows or it does not, and that absence is
the fact.** See `lib/summary-reports/provenance.ts`.

- **Two modes on the create form**, for Progress only: *From issued Daily
  Reports* (unchanged, still the default, still freezes and prints the source
  record) and *Write it directly* (`sourceMode=standalone`). A Completion Report
  has no choice: it is a consolidation by definition and still requires at least
  one source.
- **A standalone report has no sources at all.** No source rows are inserted,
  no daily-report photographs are pre-linked, no source record prints in the
  PDF, and the report screen says plainly that it has no Daily Reports behind
  it. That is what stops it claiming provenance it does not have.
- `canFinaliseSummary` now only requires sources for `completion`. Progress and
  survey need a written section and nothing else.
- **The photographs** use the survey's own workspace (`ReportPhotos`): take,
  upload, multi-select from the project, caption, AI description, remove -
  the existing photo/storage system, not a second one. Issues, supporting
  documents, preview, finalise, share and the PDF styles are all as they were.
- **AI drafting** reads what was typed into the report's own sections (the
  survey branch, generalised to "no sources"), plus the curated photo captions
  and the issue record. The evidence block is labelled
  `INFORMATION RECORDED DIRECTLY FOR THIS PERIOD (there are no daily reports)`
  rather than `ISSUED SOURCE EVIDENCE`, and the prompt carries an explicit
  instruction not to refer to daily reports, source reports or issued records.
  Without that the model writes "as recorded in the daily reports" over
  material that came off a phone.
- `npm run test:standalone` covers both workflows, including that the issued
  PDF of a standalone report names no daily report and prints no source record,
  and that the consolidating path still freezes every Daily Report in the
  period.

### PDF export: sharing, three styles, a cover photo and a sign-off

One batch across Daily, Survey, Progress and Completion PDFs. **No migration -
nothing about it is stored.**

- **Share PDF.** `/reports/[id]/file` and `/summary-reports/[id]/file` stream
  the **stored** issued PDF from our own origin (`lib/pdf/download.ts`); a
  draft gets a 404. `components/pdf/share-pdf.tsx` fetches that, wraps it in a
  `File` and hands it to `navigator.share` - the iOS share sheet, so WhatsApp,
  Mail and Teams all work - and saves the file where the browser cannot share
  one. Nothing is re-rendered to share it: the issued PDF is the record.
  The fetch starts on **pointer-down**, because Safari will not share after a
  long await; that detail is load-bearing on an iPad.
- **Quieter branding.** The repeating "SITEBOSS PRO" went from 11pt bold black
  to 7pt grey, the contractor's name now reads first, and the rule under it is
  a 1.25pt hairline with a 28pt accent stub. The title block is unchanged, so
  the document's own hierarchy now wins by a wide margin.
- **Three styles**, in `lib/pdf/presentation.ts` (pure, alias-free, so the
  picker imports it without pulling the renderer into the browser bundle):
  `siteboss` (house charcoal/amber), `corporate` (grey, no accent colour,
  softer rules, white panel) and `photo` (house colours, a cover up to 310pt
  and larger plates). `pdfTheme(style, density)` in `lib/pdf/theme.ts` builds
  them; density stays the document's business, not the user's. **Not a theme
  designer, and deliberately not extensible from the UI.**
- **Cover photo.** Chosen on the finalise screen from the photographs the
  report already prints, so nothing is uploaded or copied. Printed at its own
  ratio via `fitBox` - never cropped, never stretched - and still appears in
  the evidence grid with its P-reference. "No cover" is the default.
- **Sign-off.** Prepared by / Signature / Date near the end of all four
  documents, with the author only where one is recorded, and a line saying it
  is **not** an approval, acceptance or certificate of completion. It has no
  heading of its own: a SIGN-OFF banner cost a Progress Report with one plate
  its second page for no information at all.
- **How the choice travels, and why there is no migration.** Style and cover
  are picked on the finalise screen, sent as `?style=&cover=` on the preview
  link and as `pdfStyle`/`coverPhoto` hidden fields on the finalise form, and
  baked into the issued file. The issued PDF is the record, so the record
  holds the choice; reopening and re-issuing is where a different one takes
  effect. Nothing new is stored on a report.
- Existing issued PDFs are untouched: no route re-renders one, and the share
  route only downloads.
- `npm run test:export` covers all of it (the styles, the cover geometry, the
  sign-off wording, the share routes, and real A4 renders of every style).

### Project activity - the job's history, on the project's own page

`/projects/[id]?tab=activity`. Surveys, Daily, Progress and Completion Reports,
issues raised and issues closed, newest first, each row opening the record it
came from.

- **There is no activity table and there must not be one.** Every entry already
  exists as a report or an issue; a second copy would be one more thing to keep
  in step and a migration to pay for it. No migration was added for this.
- The rules live in `lib/projects/activity.ts` - pure, no runtime imports, no
  `@/` aliases, so `npm run test:activity` exercises them without a database.
  Date formatting is passed in for the same reason.
- Issues are read from `issues.created_at` and `issues.closed_at`, **not** from
  `issue_events`: that table has no `project_id` (it would cost a second
  lookup) and it logs every open/in-progress move, which is a log rather than a
  job history. A reopened-and-reclosed issue therefore shows one closing, at
  the time it currently holds.
- **No N+1.** Daily and summary rows come from the two queries the page already
  ran; only `created_at` was added to their selects. Issues need one extra
  query, because the Issues tab hides closed ones and the timeline needs them -
  and it only runs when the Activity tab is the one being shown.
- Every item is keyed `kind:rowId`, so merging a source in twice cannot
  duplicate an event. Capped at 100 so a two-year job does not push a thousand
  rows at a phone.
- If the issues query fails the timeline still renders the reports and says one
  line about what is missing, rather than an error card over the lot.
- Times are read on **Europe/London** (`formatTime`, `ukDay` in `lib/utils.ts`).
  The servers are UTC, and without that an entry made just after midnight in
  the summer would show an hour early, on the day before.
- Nothing about reports or issues changed. The component is read-only: no
  action, no insert, no update, no delete - the test asserts it.

### The lifecycle batch, `00a3bfb` - owner-tested and working

Confirmed by the owner on the deployed Vercel Preview, on an iPad, after the
commit was pushed. This is not a sandbox-only claim.

- **Reopen, edit and re-issue** for Daily, Progress and Completion Reports.
  "Edit final report" returns the report to draft behind a confirmation. The
  already-issued PDF is deliberately left in place and stays current, so
  abandoning an edit destroys nothing. Re-issuing writes a **new** file rather
  than overwriting, and a consolidated report counts its next `revision` at
  that moment - never at reopen - so an abandoned edit cannot inflate it.
  A reopened report is derived state, `status = 'draft' AND pdf_path IS NOT
  NULL`; there is no extra column and nothing to drift.
- **Deleting reports**, drafts and issued records alike. An issued one requires
  the word DELETE typed, not tapped.
- **Dependency protection.** A report that an issued Progress or Completion
  Report is built on - by source row *or* by one of its photographs being
  printed - refuses to delete and names the documents in the way. A cascade
  there would strand an issued PDF citing evidence that no longer exists.
- **Deleting projects**, behind a typed confirmation that counts exactly what
  goes. Storage paths are gathered *before* the cascade, so photographs and
  PDFs are cleared rather than stranded in the buckets.
- **PDF preview navigation.** Opening a PDF with `target="_blank"` handed it to
  iOS's own full-screen viewer, which has no route back - people were closing
  the app to escape it. PDFs now render in `/reports/[id]/pdf` and
  `/summary-reports/[id]/pdf` with Back above the fold; full screen is still
  one tap away and doubles as the fallback where a frame will not render one.

**No database migration was required for that batch**, and none was written.
That was verified rather than assumed, read-only against the live database:
`reports` has no constraint tying `status` to `pdf_path`; `summary_reports`'
CHECK passes any draft row; the update and delete policies on both tables are
`is_company_member(company_id)` with **no status qualifier**; and both storage
buckets have delete policies. Immutability had only ever been enforced in
application code, which is what changed.

### The documents and AI-photo batch, `fe6bf7f`

- **AI photo descriptions.** A button, never a background job. The action
  returns a sentence and writes nothing; the suggestion sits in its own panel
  and reaches the caption box only when the user presses Use it, and nothing is
  stored until Save. A hand-written caption therefore cannot be replaced by a
  model. The prompt forbids every claim an image cannot carry - completion,
  compliance, approval, certification, testing, dimensions, unidentifiable
  materials, unsupplied locations, defect cause, responsibility, workmanship.
- **Supporting documents.** Documents belong to a project; reports reference
  them, so the same RAMS is uploaded once and referenced by many reports, and
  unticking it from one leaves everything else alone. PDFs only, straight from
  the browser to the private `project-documents` bucket.
- **Issued-report provenance.** Metadata is snapshotted onto each reference at
  the moment a report is issued, so a superseded drawing cannot change what an
  issued report says it was issued against. Deleting a document referenced by
  an issued report is refused and names the reports in the way.
- The issued PDF gains a Supporting Documents table whose optional columns
  appear only when something fills them.

### Swipe actions on every list

`components/ui/swipe-row.tsx` is the one gesture: project rows, Daily Report
rows and Progress/Completion rows all use it. Same behaviour, same visual
language, arithmetic in `lib/ui/swipe.ts` and tested there.

**Deletion is never reimplemented.** Each row hands off to the component that
already owns that confirmation - `DeleteProject`, `DeleteReport`,
`DeleteSummaryReport` - which keeps its own wording, its typed confirmation for
an issued record, and the server-side dependency checks. A swipe only ever
opens a confirmation. Reopening an issued report is deliberately *not* behind a
swipe: it carries a warning about a PDF a client may already hold, and stays on
the report. A draft offers Edit, an issued report offers Open. The ••• button is
always visible for desktop and for anyone not using the gesture.

### Migration `20260831000008_site_surveys.sql` is APPLIED

Applied to the hosted project on 2026-08-30 with the owner's explicit approval,
through `apply_migration` - **not** `db push`. Do not reapply it.

Enum values only. Verified against the live schema afterwards:
`summary_report_kind` is `progress, completion, survey`; `summary_section_type`
holds 21 values (the 14 that were there plus the 7 survey sections);
`project_status` is `active, survey, on_hold, completed` - `survey` sorts
immediately after `active`, so enquiries sit above on-hold and completed work.
**Nothing else moved:** `projects` still has 17 columns, every table kept its
policy count (67 across the schema), `anon` still holds no grant anywhere, row
counts are unchanged, the `projects` md5 fingerprint is identical before and
after, and `select count(*) from projects where status = 'survey'` was **0**
straight after applying - no records were created and no data was altered.

**PostgreSQL cannot remove an enum value.** Rolling this back means leaving the
values in place and unused, which is inert.

### Settings

`/profile` is the Settings screen now (route unchanged; the tab is labelled
Settings with a cog). Appearance, Text size, Touch size, Account, App - nothing
else.

- **Device preferences, not account preferences.** `lib/preferences.ts` is a
  pure module; the values live in `localStorage`, so the site iPad in bright sun
  and somebody's own phone can differ, and **no migration was needed**.
- **Applied before first paint** by an inline script in `<head>` that stamps
  `data-theme` / `data-text` / `data-touch` on `<html>`. Anything invalid in
  storage falls back to the defaults rather than leaving the page unstyled.
- **Defaults are the application exactly as it was**: dark, medium text,
  standard touch.
- **Scaling is token-driven.** Text size sets the root font size, so every rem
  in the design system follows and no page opts out. Touch size sets
  `--ui-control-min`, which Button, Input, Select and the settings control all
  draw their minimum height from. Fields keep a 16px floor so iOS never zooms.
- **Light is a palette swap**, not a second stylesheet: same charcoal/white/gold
  identity, gold still the primary action, `--color-brand-ink` darkening gold
  where it has to be read as text on white. The SB mark keeps its white S on the
  charcoal plate and takes the page's ink when it stands on the page, so light
  mode gets the dark-S mark the brand sheet draws. `system` follows
  `prefers-color-scheme`.
- **PDFs are untouched.** `lib/pdf/theme.ts` shares nothing with the screen's
  tokens, and `e2e/settings-smoke.mjs` asserts no preference can reach it.

### Branding and the dark visual system

The application is dark now, to the approved brand sheet: charcoal `#0D0F12`
page, `#1A1D23` cards, `#2A2E36` muted, white type, SiteBoss gold `#FFC107`.
**Every colour comes from a token in `app/globals.css`** - no screen picks its
own, and `e2e/brand-smoke.mjs` fails the build if one starts to (no hex
utilities, no Tailwind palette colours, no white type on gold).

- **Gold is an accent.** It fills the one primary action on a screen, the mark,
  and nothing else; the test caps how many gold fills may exist. Active nav is a
  gold rail and gold icon, not a gold block. Focus rings are gold, because a
  white ring on charcoal is hard to separate from the text inside it.
- **The SB mark** (`components/brand/monogram.tsx`) is drawn as SVG paths, not
  set in a font - a logo that waits for a webfont is sometimes the wrong shape.
  The S is white and the B is gold, which is what stops it reading as S3, and
  the three gold bars sit beneath. `Wordmark` composes it with SITE/BOSS and
  PRO, and the strapline.
- **Home screen**: `app/manifest.ts`, `app/icon.svg`, `app/icon.png`,
  `app/apple-icon.png`, and 192/512/512-maskable in `public/`, all generated
  from the same mark. Standalone display, charcoal theme colour and splash, so
  it opens as an app rather than flashing white into a tab.
- **`components/ui/page-header.tsx`** is the one page header - title,
  description, icon tile and actions over the gold brand rule - used by the list
  and creation screens so their spacing and type cannot drift apart.
- Shared primitives were tuned rather than restyled per page: sunken inputs with
  a gold focus ring, bordered status chips with a leading dot, a red (not gold)
  destructive button, an empty state with a gold-tinted icon, and a button that
  keeps its colour while it is working instead of dimming as though it had
  failed.
- **Nothing about behaviour changed**: no schema, no report logic, no deletion
  safety, no RLS, no survey workflow, no navigation architecture. The PDF
  templates are deliberately untouched - they stay black on white for print.

### Site Survey / Inspection Report

A visit made before anybody has worked on a site, to investigate, measure and
photograph so the works can be priced. A third `summary_reports` kind, so it
inherits per-kind numbering, revisions, sections, curated photographs, the issue
record, the document register and the whole draft/preview/finalise/reopen
lifecycle.

- **`survey` project status is an enquiry.** Labelled "Survey / enquiry" in an
  info-toned badge, and audited everywhere it matters: the dashboard's active
  projects are still `.eq("status", "active")` so enquiries never distort the
  count, a Daily Report cannot be started against one, and the project form's
  zod enum accepts the value. An enquiry's project page offers the survey and
  nothing else - no Daily, Progress or Completion Report - plus a one-tap
  **Work awarded** that flips it to `active`. `awardProject` only updates a row
  that is still `survey`, so an active or completed project cannot be reset.
- **Store -> Start a site survey** creates the enquiry in the same action, with
  the store's client, address, postcode and link carried across and the project
  reference deliberately left blank. Several surveys can be run at one store:
  each creates its own enquiry, or attaches to a project already chosen.
- **A survey can also be started inside an existing project**, and from the
  reports list. `/summary-reports/new?kind=survey` redirects to the survey flow
  so a consolidated report can never be started by mistake.
- **Seven sections** - purpose, findings and existing condition, measurements,
  access and constraints, recommended works, materials/plant/access
  requirements, notes for pricing. **No workforce, plant, deliveries or works
  completed anywhere**, and the briefs forbid describing proposed work as done,
  instructed or approved. Defects observed are issues, raised through the
  existing system and printed in the report's own issue record.
- **`canFinaliseSummary` no longer demands a source report for a survey** - it
  is written from a visit, not consolidated - but still demands at least one
  written section, and an issued survey is still immutable.
- **The PDF is titled SITE SURVEY / INSPECTION REPORT**, carries "Date of visit"
  rather than a reporting period, prints no Source record when there is none,
  and opens with the heavier title block. Store identity, photo plates,
  the issue record, the document register and appendices all come from the V2
  template unchanged.
- **Photographs are taken inside the survey.** `components/summary-reports/report-photos.tsx`
  puts the camera, library and files buttons on the survey itself; a photograph
  taken there is linked to the survey the moment it lands, so nothing has to be
  found on the project tab afterwards. Thumbnails appear immediately with the
  same P01/P02 references the PDF prints, captions and AI descriptions are the
  existing `PhotoDetails`, and Remove takes the **link only** - the photograph
  stays on the project. Project photographs can still be pulled in.
  Underneath it is the same uploader, the same private bucket under
  `{company}/{project}/`, the same `photos` table and the same
  `summary_report_photos` link the PDF already reads. **No second photo system
  and no migration.**
  - The trap this created and the guard against it: a survey's curation form
    still exists for its issues, and `saveSummaryCuration` rewrites photo links
    by deleting them first. The form now carries a `photosIncluded` marker and
    the action only touches photographs when it is present, so saving the issue
    selection on a survey cannot empty its plates.
- **AI drafting reads the surveyor's own notes** (the sections they typed) plus
  curated photograph captions and issues, since there are no source reports.
  Hand-written sections are still protected from being overwritten.

### Navigation and project UX

- **Project rows swipe left** for Edit and Delete, with the gesture deliberately
  hard to trigger: it must commit clearly to going sideways before the row moves
  (vertical wins ties, so a scroll is never mistaken for a swipe), the pointer is
  captured so a fast swipe cannot strand a row half open, and a mouse drag is
  never a swipe. **Revealing the actions is not destructive.** Delete opens the
  same confirmation as the project's danger zone, the word DELETE still has to be
  typed, and `canDeleteProject` checks it again on the server. The identical two
  actions sit behind an always-visible menu button, so nothing depends on knowing
  the gesture or on having a touchscreen. `lib/ui/swipe.ts` holds the arithmetic
  and is tested directly.
- **Project cards** now carry name, client, the linked store (number and all)
  where there is one, status, open-issue count and reference. The store replaces
  the address rather than joining it. Open issues come from one flat query of
  ids, tallied in `lib/projects/row-summary.ts` - not a count per card.
- **Dashboard** leads with three one-tap actions (Daily report, New project,
  Store locator), then drafts to finish, then open critical and high issues,
  before the existing active projects and recent reports. Both new queries are
  additions: if either fails its section is simply absent rather than taking the
  dashboard down.
- `components/ui/back-link.tsx` gives one Back that always means "up a level"
  rather than into history.
- Nav is unchanged in shape: five targets on the phone with Create centred,
  Profile in the top bar.

**Archive is not implemented** - SiteBoss has no archive concept, only the
project status (active / on hold / completed), which is edited on the project
itself. Nothing was invented for it.


### Store Locator - the client store directory inside SiteBoss

The Lidl Store Locator (github.com/mikeymcyo/lidl-store-locator) is now a
SiteBoss module rather than a separate site. What it was: one 172 KB static
`index.html` PWA, no framework and no build, with the store list embedded as a
`<script type="application/json">` block and a second block for night shift.
Its data came from `UK Stores August.xlsx`, whose only columns are **P/BA,
Name, RDC, Address** - so "P/BA" *is* the store number, there is no separate
field, there is no postcode column (the postcode is the tail of the address
string) and there are **no coordinates**. Directions were a plain
`https://www.google.com/maps/dir/?api=1&destination=<address>` link with no API
key. Night shift came from `Current Nightshift Stores BELVEDERE.xlsx`, which
covers one region only - 66 of the 1,302 stores have an answer.

**The directory ships with the build, not in the database.** It is client
reference data: 1,302 rows, identical for every company, changing a few times a
year. `lib/stores/lidl-gb.json` is generated by `scripts/import-stores.mjs`,
which reads .xlsx directly (an xlsx is a zip of XML, so there is no spreadsheet
dependency). Updating is one command and a commit that can be read as a diff
and reverted like any other change - no admin screen, no database write, no
per-tenant copy to drift, and no RLS surface on data that is nobody's secret.
Search runs on the server, so the 147 KB list never reaches a phone: confirmed
absent from every client chunk in the production build.

- `/stores` - search by number, town, postcode or street, filter by RDC and by
  night shift. A number wins outright over an address that merely contains it,
  and leading zeros never matter: 34, 0034 and "#34" are the same store.
- `/stores/[code]` - the store's facts, **Directions** (a keyless Google Maps
  link, which opens the Maps app on an iPad and the website otherwise), and
  Create project here.
  - The destination is the **street line plus the postcode**, not the client's
    whole address string. Their list reads widest first ("London, Croydon,
    375-401 Brighton Road, CR2 6ES"), which Google has to work through as a
    search before it can show a route; a street and a UK postcode identify the
    building outright. **1,300 of 1,302 stores** resolve that way, the rest fall
    back to the whole address. `travelmode=driving` skips the mode picker;
    `dir_action=navigate` is deliberately not set.
  - **There are no coordinates to use instead** - the client's list has four
    columns and none of them is a latitude - and deriving them would mean a
    geocoding API and a bill.
  - `postcodeOf` tolerates two typing faults in the client's list: a letter O
    where the inward code's digit belongs, and a stray space inside the inward
    code. Both are read and written back correctly. A genuinely truncated
    postcode still comes back null.
- **Create project from a store** prefills client, site address and postcode
  from the directory. It deliberately does **not** fill the project reference:
  the store number is the client's permanent name for the building and the
  project reference is this contractor's name for this job. Conflating them
  would make two jobs at one store indistinguishable.
- Profile moved from the phone's bottom bar to the top bar, so Stores could
  join the bar without pushing the raised Create button off centre.

`directoryId` is what stops this becoming a Lidl-only application: a second
client's list is another JSON file and a line in `lib/stores/catalogue.ts`.

### Migration `20260830000007_project_locations.sql` is APPLIED

Applied to the hosted project on 2026-08-30 with the owner's explicit approval,
through `apply_migration` - **not** `db push`. Do not reapply it.

Verified against the live schema. `projects` went from 15 columns to 17 and
gained exactly `location_directory` and `location_code`, both `text`, both
nullable, neither with a default; both carry their comments; the two CHECK
constraints and the partial index `projects_location_idx` read back exactly as
the migration wrote them. **Policies stayed at 4, `anon` still holds no grant,
and the full grant string is byte-identical before and after.** All 19 tables
kept their policy counts. Row counts unchanged (10 projects, 10 reports, 2
summary reports, 10 issued PDFs in storage), and md5 fingerprints of every
report's `(id, pdf_path, status)` and every summary report's `(id, pdf_path,
status, revision)` are **identical before and after** - no historical data
moved. `linked_projects` was 0 straight after applying: no backfill.

A behavioural test then ran on hosted inside a transaction and was rolled back,
leaving nothing behind (verified: 0 rows matching the fixture). It proved an
unlinked project still saves, an existing project can adopt a store afterwards,
half a link is refused both ways, an unbounded directory is refused, and one
store carries several projects.

The ledger now holds two rows, `20260829133924 documents` and
`20260829171913 project_locations`. The first five migrations are still absent,
so **`supabase db push` remains dangerous** - it would replay them and fail on
the non-idempotent `000005`. Schema inspection is still the only source of truth.

### Store linkage, end to end

- **Create/edit a project** carries a store picker that searches the directory
  through a server action (`app/(app)/stores/actions.ts`), so the 150 KB list
  never reaches the browser - confirmed absent from every client chunk in the
  production build. Selecting a store fills the client, site address and
  postcode **only where they are empty**; anything already written is left
  alone. Removing the selection unlinks. A project without a store is an
  ordinary project and always was.
- The link is validated against the shipped directory before it is saved, so a
  project cannot record a store that does not exist.
- **The project page** shows the store, its RDC, its night shift and keyless
  Directions, resolved from the directory at render time rather than copied on
  to the project. A link to a store this build no longer lists says so rather
  than going quiet.
- **The store page** lists that company's projects at the store. RLS scopes it,
  so the directory is shared and the jobs in it are not.
- **New report output** resolves the place through `lib/reports/site-identity.ts`:
  what is written on the project always wins and the store fills the gaps, so
  linking a store adds information and never overrules a person. All three PDFs
  gain a **Store** entry in the document-control panel beside - never instead
  of - the project reference. Issued PDFs are stored files, so every historical
  report is untouched.

### PDF template v2 - the shared document system

Daily, Progress and Completion Reports are now one document family built from
`lib/pdf/theme.ts` (every size and colour) and `lib/pdf/components.tsx` (the
running header and footer, the title block, the document-control panel, section
headings, tables, status badges, issue records, photographic plates and the
document register). The two layout files hold structure and nothing else.

- **Running header and footer on every page.** Product left, company right,
  a charcoal rule with a short amber stub. The footer carries company, project,
  document and Page X of Y.
- **Document identity.** Type and number on one line, project beneath, client
  and address under that, then a control panel of dates and references. An
  entry with nothing in it is dropped rather than printed as a blank label.
- **Photographic evidence is numbered.** P01, P02, P03 ..., derived from the
  order the photographs already appear in and stored nowhere - no migration.
  Each plate prints its reference and status above the image and the caption
  below it. Captions come from what is already stored; no model is called
  during rendering and none can be.
- **A plate is drawn at the photograph's own shape.** `lib/pdf/image-size.ts`
  reads the dimensions out of the PNG, JPEG or WebP header - a few dozen bytes
  inspected, nothing decoded or re-encoded - so a portrait shot gets a portrait
  box instead of a narrow strip in a landscape one. Nothing is cropped and the
  bytes written into the PDF are the bytes that were uploaded.
- **Issue records** carry priority and status as badges and label only the
  fields that hold something.
- **The register** says plainly whether the documents follow as appendices.
  `documentsAppended` is decided before the render rather than after it, so the
  sentence inside the PDF agrees with what is actually attached.
- The Completion Report opens harder and the Daily Report is tighter - one
  `density` lever, the same components.

**Three real bugs were found and fixed while doing this**, all of them
pre-existing:

1. **No issued PDF has ever carried its running footer.** react-pdf drops an
   absolutely positioned `fixed` element as soon as a line height reaches it,
   and `lineHeight` on the Page style is inherited. Line heights now live on the
   text styles.
2. **Prose was printing at two and a half times the leading it asked for.**
   react-pdf resolves `lineHeight` against the element's own `fontSize` and
   falls back to its default of 18 rather than to the inherited size. Every
   style that sets a line height now sets its own size; the smoke test enforces
   it.
3. **`minPresenceAhead` was doing nothing.** react-pdf only honours it on a
   direct child of the Page, and every section was wrapped in its own `View`.
   The sections are fragments now, so headings genuinely reserve room - the
   Issues heading reserves the height of the record that follows it, the
   Photographs heading the height of its first plate, and a table's column
   header travels with its first row.

Photographic plates are laid out in explicit two-up rows rather than a wrapping
grid: react-pdf lays a wrapping container out as one block and split it badly,
leaving two plates on a page with two thirds of it empty.

**Page counts, measured by rendering both templates over the same fixtures.**
Every case is equal to the previous template or better: a daily report with one
photograph 2 -> **1**; three issues 2 -> **1**; three issues, four photographs
and a register 2 -> **2**; twelve photographs 3 -> **3**; a progress report with
an issue and a plate 2 -> **1**; a completion report with two issues, six plates
and a register 3 -> **3**.

`npm run test:pdf-template` renders real A4 pages, counts them with pdf-lib,
and reads the component tree for what the document actually says - the rendered
PDF cannot be searched for words because react-pdf subsets its fonts.
`e2e/support/tsx-loader.mjs` is what lets a plain Node test import a `.tsx`
layout, using the SWC that Next already ships. No new dependency and no
migration.


### Supporting documents inside the issued PDF, `d596235`

Owner-tested on the iPad and passing. Each document carries its own **Open
document** action, so one attachment can be inspected without opening the whole
package. A per-report **Include supporting documents in the final PDF** toggle
decides whether they are merged in. The merge is page-level, through `pdf-lib`
`copyPages` in `lib/pdf/merge.ts` - text stays text, a drawing stays vector,
nothing is rasterised and no expiring signed URL is printed into the file. The
order is deterministic. A document that cannot be read fails the whole merge
and is named, rather than issuing a package with a hole in it. The draft
preview renders the **same** combined bytes the finalise step would store, so
what is checked is what goes out; once issued, the stored file is immutable and
superseding the project's copy of a drawing cannot reach inside it.

### Master AI - Review and Polish Report, `d0cde9c` and `218c37e`

A whole-report review that never writes on its own. The model's reply is
reconciled in `lib/reports/master-review.ts` against the report as it actually
stands: an invented section is discarded, a section it omitted is carried
through unchanged, and its own `changed` flag is ignored in favour of comparing
the text. Only sections the user ticks are written, and "Accept all" is limited
to AI-drafted sections - hand-written paragraphs are offered one at a time.

**Contradictions are flagged, never resolved. Gaps are raised, never filled.**
This is the behaviour the owner confirmed on the iPad, where the review noticed
that the narrative said a cable issue had been sorted while the Issue record
was still OPEN and warned rather than silently closing it. Do not change it.

### The issue-closing bug, and PDF issue pagination

Two faults found on a real iPad.

**Closing an issue printed a validator sentence.** `updateIssue` in
`app/(app)/issues/actions.ts` built its parse object without a `resolution`
key, while the schema required a string - so zod reported exactly what it saw,
"Invalid input: expected string, received undefined", under the Resolution box.
The form had always sent the field. This broke *every* save from the edit form
and meant the close rule never ran at all. The field is read now; the optional
text fields tolerate a missing key rather than reporting on it; a resolution
typed against a non-closed status is kept instead of being discarded on save.

`lib/issues/validation.ts` is the deeper fix: no validator vocabulary can reach
a screen. Anything that reads like parser output is replaced with a plain
sentence, so a future form/action mismatch degrades to something harmless
rather than to nonsense under a field.

**Issues no longer own a page each.** The cause was a hard `<View break>` in
front of the Photographs section in both PDF documents: a short Issues section
ended its page early because the next section was forced onto a new one.
Removed in both. Whole sections no longer carry `wrap={false}` either - that
made a section jump a page rather than split. Headings now use
`minPresenceAhead` so they are not stranded at a page foot. Per-issue cards,
per-photo cells and table rows keep `wrap={false}`: those must stay whole.

Measured by rendering the real layouts and counting pages - daily report, three
short issues and two photographs: **3 pages before, 2 after**; six issues and
four photographs: **3 before, 2 after**; consolidated report, one short issue
and two photographs: **2 before, 1 after**. No migration.


### Migration `20260828000005_summary_reports.sql` is APPLIED

Verified 2026-08-29 against the hosted database (project `anwzyzfgfcuxrrpuaxwk`),
read-only, by schema inspection rather than by trusting this file. All six
tables exist with RLS on and the expected policy counts; `issues.resolution`
is present; both enums, both triggers, both functions, the
`issues_id_company_id_key` tenant key, all six CHECK constraints and every
declared index are in place; a column-by-column diff of the migration against
`information_schema` was **identical, 56 of 56, zero differences**; and
`anon` holds no privileges on any of the new tables.

Do **not** reapply it.

### Migration `20260829000006_documents.sql` is APPLIED

Applied to the hosted project on 2026-08-29 with the owner's explicit
approval, through `apply_migration` - **not** `db push`. Verified afterwards
against the live schema: the `document_type` enum has its ten values;
`documents`, `report_documents` and `summary_report_documents` all exist with
RLS on and four company-scoped policies each, every predicate
`is_company_member(company_id)`; `authenticated` and `service_role` are
granted and **`anon` is not**; the `project-documents` bucket is private, PDF
only, capped at 25 MB, with four storage policies; and a column-by-column diff
of the migration against `information_schema` was **identical, 39 of 39, zero
differences**. Nothing unrelated moved - all sixteen pre-existing tables kept
their exact policy counts.

A write smoke test was run on the hosted database inside a throwaway project
and then deleted, leaving all three tables empty and no storage objects. It
proved the whole chain: upload a document, link it to a report, unlink it and
confirm the project's copy survives, relink, finalise with a snapshot, then
supersede the live drawing to Rev D and confirm **the issued reference still
reads Rev C**. Cross-company isolation was checked with a genuinely different
company's user in a rolled-back transaction: it can see no document, no link
and no project of another company, cannot claim one under a foreign company id,
and cannot reference an arbitrary document - the composite foreign key refuses.

**Not yet exercised: the storage upload path itself.** The smoke test wrote
rows whose `storage_path` points at a file that was never uploaded, because
the tooling here cannot put a file in a bucket. Uploading a real PDF from the
iPad is the one part still to confirm by hand.

### The migration ledger is now partly populated - `db push` is still dangerous

`supabase_migrations.schema_migrations` holds exactly one row,
`20260829133924 documents`, because that is the only migration ever applied
through the CLI path. The first five are absent. `supabase db push` would
therefore try to replay all five of those and fail on the non-idempotent
`000005`. Schema inspection remains the only source of truth. Do not run it.

Dependency-free regression suites pass, including `test:lifecycle`,
`test:documents`, `test:photo-ai`, `test:photo-captions` and
`test:section-roles`. The SQL suites - including `03_documents_test.sql` -
pass against a real PostgreSQL 16. Lint, typecheck and a production build pass
in a dependency-complete environment.

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

State verified live: **all five migrations applied**, including `000005`
(re-verified by schema inspection on 2026-08-29); anonymous requests return
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
https://pierwsze-koty-za-ploty-git-claude-siteboss-pro-454d8e-mikeymcyo.vercel.app
```

The application is also served at **`https://app.sitebosspro.co.uk`**, aliased
to this branch's newest deployment.

**Deployment Protection is now OFF** - verified 2026-08-31 through the Vercel
API (`ssoProtection`, `passwordProtection` and `trustedIps` all disabled) and
by fetching all three URLs unauthenticated. The statements later in this file
that it blocks automated testing are out of date.

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
npm run test:viewer          which PDF the full-screen reader is pointed at
npm run test:timing          the created/issued line on a report in a list
npm run test:photo-order     plate order, and what reordering must not touch
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

### Verified 2026-08-29 by the owner on the deployed Vercel Preview, on an iPad

The `00a3bfb` lifecycle batch. Reopening an issued report, correcting it,
issuing it again, deleting reports and projects, and the new PDF viewer with
its Back control were all exercised against the real Preview and the hosted
Supabase, and behave correctly. This is the first batch confirmed on the
deployment rather than only in a sandbox.

Still unexercised by any automated suite: the reopen and delete flows have no
Supabase-backed test. `test:lifecycle` covers the rules, not the round trip.

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

- **Nothing in this batch has been run against a database.** The photo
  reorder was driven by a real Chromium at 393x852: the mode appears only on a
  report with more than one photograph, plate numbers read P01-P05, the first
  and last arrows are disabled, the pair note appears on P02 and P04, and
  moving P03 earlier reordered the tiles with every caption still attached.
  The write itself - `reorderReportPhotos` against RLS - has not run. Nor has a
  standalone Completion Report been created, nor a Progress Report with no
  period. The rules are covered by `test:photo-order`, `test:standalone` and
  `test:survey`; the round trips are not.
- **The company rename has never been run against a database.** The rules,
  the ownership check and the fact that the action reaches no stored PDF are
  covered by `test:settings`, but the write itself - and the
  `companies_update_owners` policy actually refusing a member - needs a
  Supabase, which costs the session its push (F15). The policy has never been
  exercised by anything: it was written in the first migration and nothing
  used it until now.
- **The full-screen reader has not been opened on an iPhone**, which is the
  device it exists for. It was driven by a real Chromium at 393x852 with
  `deviceScaleFactor: 3` and at 834x1112, against a three-page A4 PDF from
  this app's own renderer: six pages drawn, continuous scroll to the last
  page, the app's nav gone, magnification, Close, Share present, and no
  console errors on either. That is not iOS Safari. The two things to watch
  there are the pdf.js worker loading over a real network and a long report's
  canvases surviving on a phone. Neither viewer page has been run against a
  Supabase - both need one to return anything (F15).
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
**F24 - iOS Safari will not display a PDF in an `<iframe>`.** It draws a
single non-scrolling preview of page one - `<object>` and `<embed>` behave the
same way - so a framed PDF shows a site manager the top of his own report and
no way to reach the rest. This was shipped in `00a3bfb`, verified on an iPad,
where it works, and found broken on an iPhone. The pages are drawn with pdf.js
onto canvases instead. Use pdf.js's **legacy** build: the modern one needs
`Promise.withResolvers`, which arrived in Safari 17.4, and an older iPhone
would get a blank screen. The worker is resolved with
`new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)`, which
Turbopack emits into `.next/static/media` - do not "simplify" that to a bare
string path, and do not copy the worker into `public/`, where it would
silently drift from the installed version. Cap the canvas device scale at 2:
an A4 page at an iPhone's full 3x is about 7MB of canvas, and iOS will not
reliably hand back ten of those.

---

## 12. Known issues and technical debt

- **#441 is diagnosed but not closed** (section 9). Digest `2847415232` is still
  unresolved. It is intermittent, and has not recurred through the `26409e3`
  or `00a3bfb` work.
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
- **Superseded PDFs accumulate.** Re-issuing a corrected report leaves the
  previous file in the bucket on purpose - that is the preservation guarantee -
  but deleting a report only removes the path it currently points at, so older
  revisions are orphaned. Tracking them would need a column and a revision UI,
  both deliberately out of scope.
- **The photo curation picker is not scoped to a report's own evidence.**
  `summary-reports/[id]/page.tsx` offers every photograph on the project, and
  `saveSummaryCuration` accepts the same, so a photograph from a Daily Report
  the document is not built from can be curated into it. Established by
  reproduction on 2026-08-29; the seeding and de-duplication either side of it
  are correct. It now interacts with deletion: a photograph curated from a
  non-source daily makes that daily undeletable - right behaviour, surprising
  reason.
- **`summary_report_photos` records no provenance.** A photograph's originating
  Daily Report is only ever derived at read time from `photos.report_id`. Fine
  today; a nullable `source_report_id` would be the minimum fix if issued
  photo provenance ever needs to be frozen.
- **Reopen is not safe against two people at once.** The `.eq("status",
  "final")` guard rejects a double reopen, but two people editing one reopened
  report overwrite each other - as they would any draft.
- **PDF photo layout is tight on a phone.** Photographs print three to a row,
  which is legible on a laptop and small on an iPhone. Worth investigating two
  columns, larger images, portrait/landscape handled on their own terms, and
  room for a caption - without losing image quality. Non-blocking; the owner
  confirmed the issued package is otherwise correct.
- **Supporting documents are all-or-nothing per report.** Every selected PDF is
  appended in full, which is right for drawings and small documents but would
  quietly add a hundred pages for a full RAMS or specification. Worth a
  per-document choice between *reference only* (listed in the register) and
  *append to final PDF*. Non-blocking.
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
