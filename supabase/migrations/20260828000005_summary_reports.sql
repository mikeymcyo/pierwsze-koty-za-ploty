-- SiteBoss Pro - progress and completion reports, and issue history.
--
-- Daily site reports stay exactly as they are. They are the evidence base: a
-- finalised one is immutable, and everything here reads from them rather than
-- changing them. Nothing in this migration alters public.reports, its gapless
-- numbering trigger, or any policy that already exists.
--
-- Three report types now exist in the product:
--
--   1. Daily site reports    public.reports          (unchanged)
--   2. Progress reports      public.summary_reports  kind = 'progress'
--   3. Completion reports    public.summary_reports  kind = 'completion'
--
-- Progress and completion reports share one table because they are the same
-- kind of object - a document consolidated from evidence over a span of the
-- project, curated by a person, then issued and frozen. They differ in which
-- sections they carry and what they are built from, and that is a matter for
-- the application rather than the schema.
--
-- They are deliberately NOT rows in public.reports. That table's numbering is
-- gapless per project under an advisory lock, and sharing the sequence would
-- make "Report 007" mean either a Tuesday or a fortnight. Every query that
-- currently assumes reports means daily would also need a filter, and a missed
-- one is a silent wrong answer in a contractual record.

-- ---------------------------------------------------------------------------
-- Issues: how something was resolved, and when it moved
-- ---------------------------------------------------------------------------

-- description records the problem. Until now nothing recorded the answer, and
-- a completion report's issues-and-resolutions section is close to worthless
-- without it.
alter table public.issues add column if not exists resolution text;

-- Append-only history of status transitions.
--
-- closed_at already tells you when something closed, but nothing recorded a
-- move to in_progress, so a progress report could not honestly describe what
-- happened to an issue during a period - only its state at each end. This is
-- the smallest table that fixes that.
create table public.issue_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  issue_id uuid not null,
  -- Null on the row recording the issue being raised.
  from_status public.issue_status,
  to_status public.issue_status not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (issue_id, company_id)
    references public.issues (id, company_id) on delete cascade
);

create index issue_events_issue_id_idx on public.issue_events (issue_id, created_at);
create index issue_events_company_id_idx on public.issue_events (company_id, created_at);

-- Written by a trigger rather than by the application, so the history cannot
-- be bypassed by a code path that forgets - including a future one, or a
-- correction made by hand in the SQL editor.
--
-- SECURITY DEFINER because this is an audit record: it must be written even
-- where a policy would not let the caller insert one directly. The client has
-- no insert privilege on this table at all, so the trigger is the only way a
-- row is ever created.
create or replace function public.record_issue_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.issue_events (company_id, issue_id, from_status, to_status, created_by)
    values (new.company_id, new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.issue_events (company_id, issue_id, from_status, to_status, created_by)
    values (new.company_id, new.id, old.status, new.status, auth.uid());
  end if;

  return new;
end;
$$;

create trigger issues_record_event
  after insert or update of status on public.issues
  for each row execute function public.record_issue_event();

-- Issues raised before this migration have no history, and a progress report
-- covering that period would show a gap that is an artefact of the schema
-- rather than of the site. Reconstructed from what was already recorded: every
-- issue was raised open, and one that is no longer open moved at closed_at if
-- it has one, or at updated_at if it does not. The note says so, so nobody
-- later mistakes a reconstruction for an observation.
insert into public.issue_events (company_id, issue_id, from_status, to_status, note, created_at)
select i.company_id, i.id, null, 'open', 'Backfilled when issue history was introduced', i.created_at
  from public.issues i
 where not exists (select 1 from public.issue_events e where e.issue_id = i.id);

insert into public.issue_events (company_id, issue_id, from_status, to_status, note, created_at)
select i.company_id, i.id, 'open', i.status,
       'Backfilled when issue history was introduced',
       coalesce(i.closed_at, i.updated_at)
  from public.issues i
 where i.status <> 'open'
   and not exists (
     select 1 from public.issue_events e
      where e.issue_id = i.id and e.to_status = i.status and e.from_status is not null
   );

-- ---------------------------------------------------------------------------
-- Progress and completion reports
-- ---------------------------------------------------------------------------

create type public.summary_report_kind as enum ('progress', 'completion');

-- Both kinds draw from one list. Which subset applies is the application's
-- business: a progress report has no sign-off, a completion report has no
-- "next period". Kept as one enum so summary_report_sections needs only one
-- column and one unique constraint.
create type public.summary_section_type as enum (
  -- progress
  'period_summary',
  'key_activities',
  'works_completed',
  'works_in_progress',
  'resources_and_plant',
  'next_period',
  -- completion
  'project_overview',
  'scope_of_works',
  'stages_of_works',
  'key_technical_activities',
  'completed_works',
  'photographic_record',
  'sign_off',
  -- both
  'issues_and_resolutions'
);

create table public.summary_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  kind public.summary_report_kind not null,
  -- Numbered per project and per kind: "Progress Report 004" runs its own
  -- sequence and never disturbs the daily one.
  number integer not null default 0 check (number >= 0),
  -- Reserved for a revision workflow that is deliberately not built yet. A
  -- column costs nothing now; retrofitting a numbering scheme onto documents
  -- a client already holds does not.
  revision integer not null default 0 check (revision >= 0),
  supersedes_id uuid,
  title text,
  -- The span of project time the report covers. A completion report may leave
  -- these null, meaning the whole project, but never sets only one of them.
  period_start date,
  period_end date,
  -- The same draft/final lifecycle as a daily report: editable and
  -- regenerable while draft, an issued record afterwards.
  status public.report_status not null default 'draft',
  pdf_path text,
  finalised_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  foreign key (supersedes_id, company_id)
    references public.summary_reports (id, company_id) on delete set null (supersedes_id),
  -- Children hang off this, exactly as they do for reports and projects, so a
  -- child can never reference a parent in another company.
  unique (id, company_id),
  unique (project_id, kind, number, revision),
  constraint summary_reports_period_complete check (
    (period_start is null and period_end is null)
    or (period_start is not null and period_end is not null and period_end >= period_start)
  ),
  -- A finalised report is an issued record, so it has a PDF and a date.
  constraint summary_reports_final_is_issued check (
    status = 'draft' or (pdf_path is not null and finalised_at is not null)
  )
);

create index summary_reports_project_idx
  on public.summary_reports (project_id, kind, number desc);
create index summary_reports_company_idx on public.summary_reports (company_id);
create index summary_reports_period_idx on public.summary_reports (project_id, period_start, period_end);

-- The same shape as assign_report_number, scoped to one kind. Revisions are
-- not numbered here: a revision carries its parent's number and increments
-- revision, which the application sets when that workflow is built.
create or replace function public.assign_summary_report_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.revision = 0 and (new.number is null or new.number = 0) then
    perform pg_advisory_xact_lock(
      hashtextextended(new.project_id::text || ':' || new.kind::text, 0)
    );
    select coalesce(max(s.number), 0) + 1
      into new.number
      from public.summary_reports s
     where s.project_id = new.project_id
       and s.kind = new.kind;
  end if;
  return new;
end;
$$;

create trigger summary_reports_assign_number
  before insert on public.summary_reports
  for each row execute function public.assign_summary_report_number();

-- ---------------------------------------------------------------------------
-- The written content
-- ---------------------------------------------------------------------------

-- Mirrors report_sections, including the unique constraint that lets a
-- regeneration upsert a section rather than accumulate duplicates.
create table public.summary_report_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  summary_report_id uuid not null,
  section_type public.summary_section_type not null,
  content text,
  ai_generated boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  unique (summary_report_id, section_type)
);

create index summary_report_sections_report_idx
  on public.summary_report_sections (summary_report_id, sort_order);

-- ---------------------------------------------------------------------------
-- The evidence base, frozen
-- ---------------------------------------------------------------------------

-- What the document was built from, recorded at generation so the report stays
-- reproducible and auditable long after it was issued.
--
-- A row names either a daily report or an already-issued progress report,
-- never both. A completion report that consolidates an issued progress report
-- also records every daily report underneath it, with via_summary_report_id
-- pointing at the progress report it came through - so preferring the
-- human-reviewed narrative never loses the trail back to the original
-- evidence.
create table public.summary_report_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  summary_report_id uuid not null,
  report_id uuid,
  source_summary_report_id uuid,
  via_summary_report_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade,
  foreign key (source_summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  foreign key (via_summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete set null (via_summary_report_id),
  constraint summary_report_sources_one_source check (
    (report_id is not null and source_summary_report_id is null)
    or (report_id is null and source_summary_report_id is not null)
  ),
  -- Provenance only makes sense for a daily report reached through a progress
  -- report.
  constraint summary_report_sources_via_needs_daily check (
    via_summary_report_id is null or report_id is not null
  ),
  -- Nulls are distinct in Postgres, so these constrain only the rows that
  -- actually name that kind of source.
  unique (summary_report_id, report_id),
  unique (summary_report_id, source_summary_report_id)
);

create index summary_report_sources_report_idx
  on public.summary_report_sources (summary_report_id, sort_order);
create index summary_report_sources_daily_idx
  on public.summary_report_sources (report_id);

-- ---------------------------------------------------------------------------
-- Curation: photographs and issues
-- ---------------------------------------------------------------------------

-- SiteBoss proposes a selection; the site manager decides what a client sees.
-- Held separately from the sections so regenerating the words never discards
-- that judgement.
create table public.summary_report_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  summary_report_id uuid not null,
  photo_id uuid not null,
  sort_order integer not null default 0,
  -- A caption written for a daily report is often too terse for a client
  -- document. The original stays untouched on the photo.
  caption_override text,
  created_at timestamptz not null default now(),
  foreign key (summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  foreign key (photo_id, company_id)
    references public.photos (id, company_id) on delete cascade,
  unique (summary_report_id, photo_id)
);

create index summary_report_photos_report_idx
  on public.summary_report_photos (summary_report_id, sort_order);

-- Which issues the document presents, and how they stood when it was issued.
-- The status is captured because the issue keeps moving after the report is
-- sent, and the report must keep saying what it said.
create table public.summary_report_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  summary_report_id uuid not null,
  issue_id uuid not null,
  sort_order integer not null default 0,
  status_at_issue public.issue_status,
  resolution_at_issue text,
  created_at timestamptz not null default now(),
  foreign key (summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  foreign key (issue_id, company_id)
    references public.issues (id, company_id) on delete cascade,
  unique (summary_report_id, issue_id)
);

create index summary_report_issues_report_idx
  on public.summary_report_issues (summary_report_id, sort_order);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['summary_reports', 'summary_report_sections']
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Migration-created tables carry no privileges of their own: Postgres checks
-- the table grant before it ever reaches a policy, so without these every
-- query fails with "permission denied for table" no matter how correct the
-- RLS is. See F1 in HANDOFF.md - this has caught this project before.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.summary_reports,
  public.summary_report_sections,
  public.summary_report_sources,
  public.summary_report_photos,
  public.summary_report_issues
to authenticated;

-- Read-only on purpose. History is written by the trigger and by nothing else,
-- so an audit trail cannot be edited to say something more convenient.
grant select on public.issue_events to authenticated;

grant all on
  public.summary_reports,
  public.summary_report_sections,
  public.summary_report_sources,
  public.summary_report_photos,
  public.summary_report_issues,
  public.issue_events
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The same shape as migration 2: every policy resolves company_id through
-- public.is_company_member, which is SECURITY DEFINER so that reading
-- company_members inside a policy cannot re-enter RLS and recurse.
--
-- Tenant isolation on the child tables rests on two independent things. These
-- policies, and the composite foreign keys above against (parent_id,
-- company_id) - so a curated photo or a source report physically cannot point
-- at another company's row even if a policy were wrong.
-- ---------------------------------------------------------------------------

alter table public.summary_reports          enable row level security;
alter table public.summary_report_sections  enable row level security;
alter table public.summary_report_sources   enable row level security;
alter table public.summary_report_photos    enable row level security;
alter table public.summary_report_issues    enable row level security;
alter table public.issue_events             enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'summary_reports', 'summary_report_sections', 'summary_report_sources',
    'summary_report_photos', 'summary_report_issues'
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

-- Readable by the company, writable by nobody. There is deliberately no
-- insert, update or delete policy: the trigger is SECURITY DEFINER and does
-- not need one.
create policy issue_events_select_company on public.issue_events
  for select to authenticated
  using (public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Anonymous access, again
--
-- Repeated from migration 4 because that migration ran before these tables
-- existed, and a hosted project's default privileges may have granted the new
-- ones to anon on creation. Idempotent.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
