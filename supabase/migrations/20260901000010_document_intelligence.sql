-- Document Intelligence: which documents the AI is allowed to read, and what
-- reading them produced.
--
-- Additive. Three new objects and nothing else: no existing table is altered,
-- no column is dropped or retyped, no policy is replaced, no trigger on an
-- existing table is touched, no enum is extended, and no row in any existing
-- table is read or written by this migration. Applying it to a database with
-- live data changes nothing that is already there.
--
-- ---------------------------------------------------------------------------
-- Three concepts, three tables
-- ---------------------------------------------------------------------------
--
-- A document can be involved in a job in three unrelated ways, and conflating
-- any two of them produces a wrong document or a wrong report:
--
--   1. USE AS AI CONTEXT      - job_context_documents (this migration)
--      Somebody has said this paperwork describes the job. The AI may read it
--      when it cleans up notes, drafts a report or describes a photograph.
--   2. REFERENCE IN REPORT    - report_documents / summary_report_documents
--      An issued report states it was issued against this revision of this
--      drawing. Already built, with its at-issue snapshot.
--   3. APPEND TO THE PDF      - the document package
--      The file is bound into the back of the PDF. Already built, and
--      deliberately separate: a purchase order can be scope the AI should read
--      and still be the last thing you would send back to the client.
--
-- A purchase order is usually (1). A drawing register is usually (2). Nothing
-- here makes one imply another, and the screens already say so in those words.
--
-- ---------------------------------------------------------------------------
-- What this migration does NOT do
-- ---------------------------------------------------------------------------
--
-- It does not backfill. The `(doc:uuid)` markers written into
-- projects.description by the job brief stay exactly where they are, untouched
-- and unread. They are history - the record that a document arrived at half
-- past two and was called scope then - and history is not migrated, it is
-- kept. Reconciling "this project's markers" with "this project's context
-- rows" is an application decision in the next step, not a data rewrite here.
--
-- It also adds no storage bucket. Extraction reads the object already in
-- project-documents; there is no new file to keep.

-- ---------------------------------------------------------------------------
-- 1. Use as AI context
-- ---------------------------------------------------------------------------
--
-- Why a table and not a boolean on documents.
--
-- Because the interesting part is not the flag, it is who decided and when. A
-- model that reads a purchase order and gets the scope wrong is a report that
-- is wrong, and the first question afterwards is "who told it to read that".
-- A column answers none of that, and setting one would mean altering a live
-- table; a row carries the person, the moment and their reason, and adding it
-- touches nothing that exists.
--
-- Why there is no project_id here.
--
-- documents.project_id is NOT NULL, so a document already belongs to exactly
-- one project and a project_id on this row could only ever agree with it or
-- contradict it. There is no third possibility worth a trigger to police, so
-- the column is not here to be wrong: the project is read through the
-- document. Deleting the project still cascades - projects -> documents ->
-- these rows.

create table public.job_context_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_id uuid not null,
  -- The order the documents are handed to the model. A specification read
  -- before the purchase order that supersedes it reads differently.
  sort_order integer not null default 0,
  -- Why this is scope, in the words of whoever said so. Optional: most of the
  -- time the document's own title is the whole answer, and a required box is a
  -- box people fill with anything.
  note text,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade,
  -- A document is job context or it is not. Twice is a mistake, not a fact.
  unique (document_id)
);

create index job_context_documents_company_idx
  on public.job_context_documents (company_id);
create index job_context_documents_order_idx
  on public.job_context_documents (sort_order, created_at);

comment on table public.job_context_documents is
  'Documents somebody has marked "use as AI context" for their project. Not the same as referencing a document in a report, and not the same as appending it to the PDF package.';

-- ---------------------------------------------------------------------------
-- 2. How an extraction is going
-- ---------------------------------------------------------------------------
--
-- Five values, and no more, because PostgreSQL cannot remove one. Anything
-- genuinely missing is a one-line ALTER TYPE later, which the site_surveys
-- migration already shows costs nothing; a value added now and regretted is
-- permanent.
--
--   pending    - asked for, not started.
--   running    - the model call is in flight.
--   succeeded  - there is a result, and it is the current one.
--   failed     - it did not work, and the row says why.
--   superseded - it worked, and a later extraction of the same document
--                replaced it. The row is kept, not deleted: a report drafted
--                last week was drafted from that reading of the document, and
--                deleting it would leave the report unexplainable.

create type public.extraction_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'superseded'
);

-- ---------------------------------------------------------------------------
-- 3. What reading the document produced
-- ---------------------------------------------------------------------------
--
-- One row per attempt, never overwritten in place by the next attempt. The
-- table is a record of readings, not a cache of the latest one.
--
-- Traceable to source means three things are on the row, all captured at the
-- time of the reading rather than looked up afterwards:
--
--   - the exact object read (source_storage_path, source_sha256, source_bytes),
--     so "which file did this come from" survives the document being replaced;
--   - the text the model was actually given (source_text), so a person can
--     check that a quoted requirement really appears in the document rather
--     than taking the model's word for it;
--   - what did the reading (model, prompt_version), so a bad extraction can be
--     traced to the instructions that produced it and every other extraction
--     from the same instructions can be found.
--
-- Why content is jsonb and not its own items table.
--
-- Because the shape is not settled. A purchase order yields an order number
-- and line items; a RAMS yields hazards and controls; a drawing yields a
-- number, a revision and a scale. Freezing that into columns now would mean a
-- migration every time the model's schema moves, and the schema will move.
-- jsonb is where a JSON-schema response lands with nothing lost. The rule the
-- application enforces on that payload is that every extracted item carries
-- its own page number and its own verbatim quote - a claim with no anchor into
-- the document is not an extraction, it is a guess. When the shape stops
-- moving, promoting it to a document_extraction_items table is a later,
-- additive migration reading these rows.

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  document_id uuid not null,
  status public.extraction_status not null default 'pending',

  -- What was read
  source_storage_path text not null,
  source_sha256 text,
  source_bytes bigint check (source_bytes is null or source_bytes >= 0),
  source_page_count integer check (source_page_count is null or source_page_count > 0),
  source_text text,

  -- What it produced
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  summary text,

  -- What produced it
  model text,
  prompt_version text,

  -- How it went
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade,

  -- A failure that does not say why is the failure this product exists to
  -- avoid: the screen would have to invent a reason or show none.
  constraint document_extractions_failed_says_why
    check (status <> 'failed' or error is not null),
  -- Finished means finished at a time.
  constraint document_extractions_finished_has_time
    check (status not in ('succeeded', 'failed') or completed_at is not null)
);

-- The list on a document's screen, newest reading first.
create index document_extractions_document_idx
  on public.document_extractions (document_id, created_at desc);
create index document_extractions_company_idx
  on public.document_extractions (company_id);

-- At most one current reading per document. Two rows both claiming to be the
-- extraction of the same file is two answers to one question, and the AI
-- context block would have to pick one at random. Re-extracting means marking
-- the old row 'superseded' and then inserting the new one.
create unique index document_extractions_one_current
  on public.document_extractions (document_id)
  where status = 'succeeded'::public.extraction_status;

-- At most one extraction in flight per document, so a double tap on a phone
-- with a bad signal cannot spend the model call twice.
create unique index document_extractions_one_in_flight
  on public.document_extractions (document_id)
  where status in ('pending'::public.extraction_status,
                   'running'::public.extraction_status);

create trigger document_extractions_set_updated_at
  before update on public.document_extractions
  for each row execute function public.set_updated_at();

comment on table public.document_extractions is
  'One row per reading of a document. Kept, not overwritten: a report drafted from an earlier reading has to remain explainable.';
comment on column public.document_extractions.content is
  'The structured extraction, as the model returned it. Every item in it carries its own page number and verbatim quote; the application enforces that, because an extracted claim with no anchor into the document is a guess.';
comment on column public.document_extractions.source_text is
  'The text the model was actually given. Kept so a quoted requirement can be checked against the document rather than believed.';

-- ---------------------------------------------------------------------------
-- Privileges, then row level security
-- ---------------------------------------------------------------------------

-- Postgres checks table-level GRANT before it ever reaches a policy, so a
-- table with RLS and no grant fails every query with "permission denied".
-- anon is granted nothing, matching 20260826000004_revoke_anon.sql.

grant select, insert, update, delete
  on public.job_context_documents, public.document_extractions
  to authenticated;

grant select, insert, update, delete
  on public.job_context_documents, public.document_extractions
  to service_role;

alter table public.job_context_documents enable row level security;
alter table public.document_extractions  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'job_context_documents', 'document_extractions'
  ]
  loop
    execute format($p$
      create policy %1$I on public.%2$I
        for select to authenticated
        using (public.is_company_member(company_id));
    $p$, t || '_select_company', t);

    execute format($p$
      create policy %1$I on public.%2$I
        for insert to authenticated
        with check (public.is_company_member(company_id));
    $p$, t || '_insert_company', t);

    execute format($p$
      create policy %1$I on public.%2$I
        for update to authenticated
        using (public.is_company_member(company_id))
        with check (public.is_company_member(company_id));
    $p$, t || '_update_company', t);

    execute format($p$
      create policy %1$I on public.%2$I
        for delete to authenticated
        using (public.is_company_member(company_id));
    $p$, t || '_delete_company', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
--   drop table if exists public.document_extractions;
--   drop table if exists public.job_context_documents;
--   drop type  if exists public.extraction_status;
--
-- Safe at any time in that order. Nothing outside these three objects
-- references them, so dropping them loses the extractions and the context
-- marks and nothing else: no document, no file, no report and no brief entry
-- lives in here, and the `(doc:uuid)` markers in projects.description are
-- untouched by both this migration and its rollback.
