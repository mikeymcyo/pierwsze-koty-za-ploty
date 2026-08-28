-- ---------------------------------------------------------------------------
-- SiteBoss Pro - every migration, combined into one script.
--
-- GENERATED FILE - DO NOT EDIT.
-- Edit the files in supabase/migrations/ and rerun:
--     ./scripts/build-combined-migration.sh
--
-- HOW TO USE
--   Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--   Run it once, on a fresh project.
--
--   Afterwards, Table Editor should list ten tables and Storage should show the
--   "site-photos" and "report-pdfs" buckets.
--
-- Requires PostgreSQL 15 or newer. Every Supabase project qualifies.
-- ---------------------------------------------------------------------------


-- =========================================================================
-- 20260826000001_initial_schema.sql
-- =========================================================================

-- SiteBoss Pro - initial schema.
--
-- Requires PostgreSQL 15 or newer (uses ON DELETE SET NULL with a column list).
-- Every Supabase project created since 2023 satisfies this.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.company_role as enum ('owner', 'member');

create type public.project_status as enum ('active', 'on_hold', 'completed');

create type public.report_status as enum ('draft', 'final');

create type public.report_section_type as enum (
  'executive_summary',
  'works_completed',
  'works_in_progress',
  'deliveries_plant',
  'health_safety',
  'issues_constraints',
  'outstanding_items',
  'planned_works'
);

create type public.photo_category as enum (
  'work_completed',
  'before',
  'after',
  'defect',
  'safety',
  'progress',
  'delivery',
  'general'
);

create type public.photo_pair_role as enum ('before', 'after');

create type public.issue_priority as enum ('low', 'medium', 'high', 'critical');

create type public.issue_status as enum ('open', 'in_progress', 'closed');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy: companies, memberships, profiles
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.company_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members (user_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership lookup used by every RLS policy. SECURITY DEFINER so that reading
-- company_members from inside a policy does not re-enter RLS and recurse.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = target_company_id
      and m.user_id = auth.uid()
  );
$$;

-- True when the given user shares at least one company with the caller.
create or replace function public.shares_company_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members mine
    join public.company_members theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  client text,
  site_address text,
  postcode text,
  project_reference text,
  site_manager text,
  start_date date,
  expected_completion_date date,
  description text,
  status public.project_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for composite foreign keys: a child row can only reference a parent
  -- inside its own company, enforced by the database rather than app code.
  unique (id, company_id)
);

create index projects_company_id_idx on public.projects (company_id);
create index projects_company_status_idx on public.projects (company_id, status);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  report_number integer not null default 0 check (report_number >= 0),
  report_date date not null default current_date,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  weather text,
  -- The raw dictated or typed input, preserved verbatim so the user can always
  -- see what they actually said next to what the AI wrote.
  raw_notes text,
  status public.report_status not null default 'draft',
  pdf_path text,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  unique (project_id, report_number),
  unique (id, company_id)
);

create index reports_company_id_idx on public.reports (company_id);
create index reports_project_id_idx on public.reports (project_id, report_number desc);
create index reports_company_date_idx on public.reports (company_id, report_date desc);

-- Per-project sequential report numbers. The advisory lock serialises
-- concurrent inserts for the same project so two supervisors creating a report
-- at the same moment cannot claim the same number.
create or replace function public.assign_report_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.report_number is null or new.report_number = 0 then
    perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));
    select coalesce(max(r.report_number), 0) + 1
      into new.report_number
      from public.reports r
     where r.project_id = new.project_id;
  end if;
  return new;
end;
$$;

create trigger reports_assign_number
  before insert on public.reports
  for each row execute function public.assign_report_number();

-- ---------------------------------------------------------------------------
-- Report sections (AI-generated, user-editable)
-- ---------------------------------------------------------------------------

create table public.report_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  report_id uuid not null,
  section_type public.report_section_type not null,
  content text,
  ai_generated boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade,
  unique (report_id, section_type)
);

create index report_sections_report_id_idx on public.report_sections (report_id, sort_order);

-- ---------------------------------------------------------------------------
-- Workforce and plant
-- ---------------------------------------------------------------------------

create table public.workforce_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  report_id uuid not null,
  company_name text not null check (length(trim(company_name)) > 0),
  trade text,
  operatives integer not null default 1 check (operatives >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade
);

create index workforce_entries_report_id_idx on public.workforce_entries (report_id, sort_order);

create table public.plant_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  report_id uuid not null,
  description text not null check (length(trim(description)) > 0),
  quantity integer not null default 1 check (quantity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade
);

create index plant_entries_report_id_idx on public.plant_entries (report_id, sort_order);

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  -- Null for photos captured against the project outside of any report.
  report_id uuid,
  storage_path text not null,
  caption text,
  -- What the user actually typed, kept alongside the AI-polished caption.
  original_caption text,
  category public.photo_category not null default 'general',
  -- Before/after pairs: both rows share a pair_id and take opposite roles.
  pair_id uuid,
  pair_role public.photo_pair_role,
  width integer,
  height integer,
  taken_at timestamptz,
  sort_order integer not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade,
  unique (id, company_id),
  -- pair_id and pair_role are meaningful only together.
  constraint photos_pair_complete check (
    (pair_id is null and pair_role is null)
    or (pair_id is not null and pair_role is not null)
  )
);

create index photos_company_id_idx on public.photos (company_id);
create index photos_project_id_idx on public.photos (project_id, created_at desc);
create index photos_report_id_idx on public.photos (report_id, sort_order);
-- A pair holds at most one "before" and one "after".
create unique index photos_pair_role_idx on public.photos (pair_id, pair_role)
  where pair_id is not null;

-- ---------------------------------------------------------------------------
-- Issues / outstanding items
-- ---------------------------------------------------------------------------

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  -- The report the issue was first raised in. Issues outlive reports, so this
  -- is cleared rather than cascaded when a report is deleted.
  report_id uuid,
  title text not null check (length(trim(title)) > 0),
  description text,
  photo_id uuid,
  responsible text,
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete set null (report_id),
  foreign key (photo_id, company_id)
    references public.photos (id, company_id) on delete set null (photo_id)
);

create index issues_company_id_idx on public.issues (company_id);
create index issues_project_status_idx on public.issues (project_id, status);
create index issues_report_id_idx on public.issues (report_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'company_members', 'profiles', 'projects', 'reports',
    'report_sections', 'workforce_entries', 'plant_entries', 'photos', 'issues'
  ]
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
-- Signup: every new user gets a profile, a company, and an owner membership.
-- Done in the database so a user can never exist without a company.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_company_id uuid;
  company_label text;
  person_name text;
begin
  person_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  company_label := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');

  if company_label is null then
    company_label := coalesce(person_name, split_part(new.email, '@', 1)) || ' (Personal)';
  end if;

  insert into public.companies (name)
  values (company_label)
  returning id into new_company_id;

  insert into public.profiles (id, full_name)
  values (new.id, person_name);

  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =========================================================================
-- 20260826000002_rls_policies.sql
-- =========================================================================

-- SiteBoss Pro - Row Level Security.
--
-- Every table carries company_id, and every policy resolves it through
-- public.is_company_member(). A user can therefore never read or write a row
-- belonging to another company, regardless of what the application sends.

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = target_company_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- RLS decides which *rows* a user may touch, but PostgreSQL still checks
-- table-level GRANTs first. Tables created by a migration are owned by the
-- postgres role and carry no grants of their own, so without this block every
-- query from the app fails with "permission denied for table ...".
--
-- Nothing is granted to "anon": SiteBoss Pro has no anonymous data access.
--
-- "service_role" is Supabase's trusted server-side role. It carries BYPASSRLS,
-- so it is only ever used from server code holding the service role key - that
-- key must never be exposed to the browser.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.projects,
  public.reports,
  public.report_sections,
  public.workforce_entries,
  public.plant_entries,
  public.photos,
  public.issues
to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select on public.company_members to authenticated;

grant all on
  public.companies,
  public.company_members,
  public.profiles,
  public.projects,
  public.reports,
  public.report_sections,
  public.workforce_entries,
  public.plant_entries,
  public.photos,
  public.issues
to service_role;

grant execute on function public.is_company_member(uuid) to authenticated, service_role;
grant execute on function public.is_company_owner(uuid) to authenticated, service_role;
grant execute on function public.shares_company_with(uuid) to authenticated, service_role;

alter table public.companies        enable row level security;
alter table public.company_members  enable row level security;
alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.reports          enable row level security;
alter table public.report_sections  enable row level security;
alter table public.workforce_entries enable row level security;
alter table public.plant_entries    enable row level security;
alter table public.photos           enable row level security;
alter table public.issues           enable row level security;

-- ---------------------------------------------------------------------------
-- companies - readable by members, renameable by owners. Rows are created by
-- the signup trigger only, so there is deliberately no insert or delete policy.
-- ---------------------------------------------------------------------------

create policy "companies_select_members" on public.companies
  for select to authenticated
  using (public.is_company_member(id));

create policy "companies_update_owners" on public.companies
  for update to authenticated
  using (public.is_company_owner(id))
  with check (public.is_company_owner(id));

-- ---------------------------------------------------------------------------
-- company_members - read-only from the client in the MVP. Team invitations are
-- a later phase and will add write policies then.
-- ---------------------------------------------------------------------------

create policy "company_members_select_own_company" on public.company_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "profiles_select_self_or_colleague" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id));

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Company-scoped tables. Identical shape for each: full CRUD within your own
-- company, nothing at all outside it.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'reports', 'report_sections', 'workforce_entries',
    'plant_entries', 'photos', 'issues'
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


-- =========================================================================
-- 20260826000003_storage.sql
-- =========================================================================

-- SiteBoss Pro - private storage buckets.
--
-- Object paths are always "{company_id}/{project_id}/{filename}", and access is
-- granted by matching the leading folder against the caller's company.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'site-photos',
    'site-photos',
    false,
    -- Photos are compressed on the device before upload; this is a safety net.
    15728640, -- 15 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'report-pdfs',
    'report-pdfs',
    false,
    52428800, -- 50 MB
    array['application/pdf']
  )
on conflict (id) do nothing;

-- Reads the leading path segment as a company id, returning null (rather than
-- raising) for any object whose name does not start with a uuid folder.
create or replace function public.storage_company_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function public.storage_company_id(text) to authenticated, service_role;

do $$
declare
  b text;
begin
  foreach b in array array['site-photos', 'report-pdfs']
  loop
    execute format($p$
      create policy %1$I on storage.objects
        for select to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_select', b);

    execute format($p$
      create policy %1$I on storage.objects
        for insert to authenticated
        with check (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_insert', b);

    execute format($p$
      create policy %1$I on storage.objects
        for update to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        )
        with check (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_update', b);

    execute format($p$
      create policy %1$I on storage.objects
        for delete to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_delete', b);
  end loop;
end;
$$;


-- =========================================================================
-- 20260826000004_revoke_anon.sql
-- =========================================================================

-- SiteBoss Pro - remove every privilege from the anonymous role.
--
-- SiteBoss Pro has no anonymous data access: you are signed in or you see
-- nothing. Migration 2 grants "authenticated" and "service_role" explicitly and
-- never mentions "anon", but that is not enough on its own.
--
-- Hosted Supabase projects carry ALTER DEFAULT PRIVILEGES rules that grant new
-- tables in the public schema to anon automatically, and those rules apply to
-- anything created by the postgres role - which is what the SQL Editor runs as.
-- A table created there therefore starts out readable by anon, while the same
-- migration applied through the CLI does not. Row Level Security still returns
-- no rows, because every policy in migration 2 is declared "to authenticated"
-- and anon has no policy at all, so nothing leaks either way.
--
-- The risk this closes is a future one: a policy written without a role
-- restriction (for example "using (true)" for select) would immediately be
-- readable by anon if the underlying table grant were still in place. Revoking
-- makes the intent explicit and the behaviour identical on every platform.
--
-- Safe to run more than once, and safe to run on a project where the earlier
-- migrations are already applied.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

-- Stop future tables in this schema from being granted to anon by default.
-- Written for both role contexts, since which one owns new objects depends on
-- whether a migration is applied through the SQL Editor or the CLI.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
  execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon';
  execute 'alter default privileges for role postgres in schema public revoke all on functions from anon';
exception
  when insufficient_privilege then
    -- Not the owner of the postgres role's defaults; the statements above still
    -- cover objects created in this session's role context.
    null;
end;
$$;


-- =========================================================================
-- 20260828000005_summary_reports.sql
-- =========================================================================

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

-- Nothing referenced issues as a parent until now, so it never needed the
-- composite key that every other parent in this schema carries. Both
-- issue_events and summary_report_issues point at (issue_id, company_id), and
-- a composite foreign key needs a matching unique constraint to point at - so
-- without this the migration fails outright, which is how it was found.
--
-- id is already the primary key, so this constrains nothing new. It exists to
-- make the tenant-scoped foreign keys below possible.
do $$
begin
  alter table public.issues add constraint issues_id_company_id_key unique (id, company_id);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end;
$$;

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
