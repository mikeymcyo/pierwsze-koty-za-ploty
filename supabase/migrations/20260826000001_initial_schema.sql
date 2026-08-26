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
