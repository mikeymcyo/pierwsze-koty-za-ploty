-- SiteBoss Pro - Open Jobs: the purchase orders a crew is attending.
--
-- Additive. Nothing existing is altered: no column is dropped or retyped, no
-- policy is replaced, no trigger is touched, and no row in any existing table
-- is read or written by this migration.
--
-- A job is one visit to one store: what has to be done, who is going, when,
-- and where. It carries the Lidl purchase orders it is doing the work under,
-- and for each PO the PDF Lidl issued - the one with the QR code that is
-- scanned on site to raise the CAR. The PDF is attached by hand for now; the
-- po_file_id is the Empire Automations portal's id for the same file, kept so
-- a later feed can fetch it without a second migration.
--
-- Dates are kept as the store's local date and clock time, not an instant: a
-- 05:00 attendance at Whitton is 05:00 at Whitton whatever the server's zone.

create type public.job_status as enum ('open', 'done');

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- "Shoreham" and "GB1443", kept apart so either can be searched for.
  store_name text not null check (length(trim(store_name)) > 0),
  store_code text,
  -- A fixed attendance: the date, the clock time if one has been set, and
  -- anything said about it ("AM, time TBC").
  fixed_date date,
  fixed_time time,
  fixed_note text,
  -- Otherwise the date the client wants it done by.
  target_date date,
  work text not null default '',
  crew text,
  address text,
  lat double precision,
  lng double precision,
  notes text,
  status public.job_status not null default 'open',
  done_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for the composite foreign key below: a PO can only belong to a
  -- job inside its own company, enforced by the database.
  unique (id, company_id)
);

create index jobs_company_status_idx on public.jobs (company_id, status);

-- ---------------------------------------------------------------------------
-- The purchase orders a job is working under, and their PDFs
-- ---------------------------------------------------------------------------

create table public.job_pos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  job_id uuid not null,
  po_number text not null check (length(trim(po_number)) > 0),
  -- The Empire Automations portal's file id for this PO's PDF. Not used yet;
  -- kept so the feed can be added later.
  po_file_id bigint,
  -- Object in the private job-pos bucket, under {company_id}/{job_id}/, the
  -- same shape as photos and documents so the storage policies below can
  -- match on the leading folder. Null until a PDF has been attached.
  storage_path text,
  original_filename text,
  file_size bigint check (file_size is null or file_size >= 0),
  attached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (job_id, company_id)
    references public.jobs (id, company_id) on delete cascade,
  -- One row per PO per job. The same PO listed twice is a mistake.
  unique (job_id, po_number)
);

create index job_pos_job_idx on public.job_pos (job_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at, as every other table keeps it
-- ---------------------------------------------------------------------------

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger job_pos_set_updated_at
  before update on public.job_pos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: a company sees only its own jobs
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.job_pos enable row level security;

-- anon is granted nothing, matching 20260826000004_revoke_anon.sql.

do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'job_pos']
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
-- Storage: the PO PDFs
-- ---------------------------------------------------------------------------

-- Private, like every other bucket. A purchase order is not public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-pos',
  'job-pos',
  false,
  26214400, -- 25 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Select, insert and delete only. No update policy: a replaced PDF is a new
-- object and the old one is removed, never an object written over in place -
-- the same rule 20260918000001_report_pdfs_no_update.sql set for report PDFs.
create policy "job-pos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-pos'
    and public.is_company_member(public.storage_company_id(name))
  );

create policy "job-pos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-pos'
    and public.is_company_member(public.storage_company_id(name))
  );

create policy "job-pos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'job-pos'
    and public.is_company_member(public.storage_company_id(name))
  );
