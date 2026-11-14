-- SiteBoss Pro - supporting documents, and which reports reference them.
--
-- Additive. Nothing existing is altered: no column is dropped or retyped, no
-- policy is replaced, no trigger is touched, and no row in any existing table
-- is read or written by this migration. Applying it to a database with live
-- data changes nothing that is already there.
--
-- A construction report is rarely just prose and photographs. It is issued
-- alongside drawings, RAMS, method statements, permits, inspection sheets and
-- delivery notes, and months later the question in a dispute is not only what
-- the report said but which revision of which drawing it was issued against.
-- That is what these tables record.
--
-- Documents belong to a PROJECT. Reports REFERENCE them. The two are kept
-- apart on purpose: the same RAMS is referenced by thirty daily reports and
-- must be uploaded once, and removing it from one report must leave the
-- project's copy and the other twenty-nine references alone.

-- ---------------------------------------------------------------------------
-- What kind of document it is
-- ---------------------------------------------------------------------------

create type public.document_type as enum (
  'drawing',
  'specification',
  'rams',
  'method_statement',
  'permit',
  'inspection_sheet',
  'certificate',
  'delivery_note',
  'client_instruction',
  'other'
);

-- ---------------------------------------------------------------------------
-- The documents themselves
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  -- Object in the private project-documents bucket, under
  -- {company_id}/{project_id}/, the same shape as photos and report PDFs so
  -- the storage policies below can match on the leading folder.
  storage_path text not null,
  -- What a person calls it. Defaulted from the filename at upload, because a
  -- site manager will not retype "GA-Plan-Rev-C.pdf" on a phone.
  title text not null check (length(trim(title)) > 0),
  original_filename text not null,
  doc_type public.document_type not null default 'other',
  description text,
  -- Optional and deliberately not enforced. A delivery note has no revision;
  -- a permit has an expiry and a drawing does not. Forcing every field would
  -- mean inventing values, which is exactly what this product does not do.
  reference text,
  revision text,
  document_date date,
  expiry_date date,
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  -- Target for the composite foreign keys below: a reference can only reach a
  -- document inside its own company, enforced by the database rather than by
  -- application code.
  unique (id, company_id)
);

create index documents_project_idx on public.documents (project_id, created_at desc);
create index documents_company_idx on public.documents (company_id);

-- ---------------------------------------------------------------------------
-- Which documents a report was issued against
-- ---------------------------------------------------------------------------

-- The *_at_issue columns are the point of these tables.
--
-- A drawing gets superseded. Rev C becomes Rev D, somebody edits the title,
-- and the reference is corrected. None of that may change what an already
-- issued report says it was issued against - the stored PDF still names Rev C,
-- and the record behind it has to agree. So the metadata is snapshotted onto
-- the link at the moment the report is finalised, exactly as
-- summary_report_issues snapshots an issue's status.
--
-- They are nullable because a draft has not been issued yet and has nothing to
-- snapshot; the live document is read directly until then.

create table public.report_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  report_id uuid not null,
  document_id uuid not null,
  sort_order integer not null default 0,
  title_at_issue text,
  type_at_issue public.document_type,
  reference_at_issue text,
  revision_at_issue text,
  document_date_at_issue date,
  created_at timestamptz not null default now(),
  foreign key (report_id, company_id)
    references public.reports (id, company_id) on delete cascade,
  foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade,
  -- One reference per document per report. Referencing the same drawing twice
  -- is a mistake, not a fact.
  unique (report_id, document_id)
);

create index report_documents_report_idx on public.report_documents (report_id, sort_order);
create index report_documents_document_idx on public.report_documents (document_id);

create table public.summary_report_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  summary_report_id uuid not null,
  document_id uuid not null,
  sort_order integer not null default 0,
  title_at_issue text,
  type_at_issue public.document_type,
  reference_at_issue text,
  revision_at_issue text,
  document_date_at_issue date,
  created_at timestamptz not null default now(),
  foreign key (summary_report_id, company_id)
    references public.summary_reports (id, company_id) on delete cascade,
  foreign key (document_id, company_id)
    references public.documents (id, company_id) on delete cascade,
  unique (summary_report_id, document_id)
);

create index summary_report_documents_report_idx
  on public.summary_report_documents (summary_report_id, sort_order);
create index summary_report_documents_document_idx
  on public.summary_report_documents (document_id);

-- ---------------------------------------------------------------------------
-- Privileges, then row level security
-- ---------------------------------------------------------------------------

-- Postgres checks table-level GRANT before it ever reaches a policy, so a
-- table with RLS and no grant fails every query with "permission denied".
-- anon is granted nothing, matching 20260826000004_revoke_anon.sql.

grant select, insert, update, delete
  on public.documents, public.report_documents, public.summary_report_documents
  to authenticated;

grant select, insert, update, delete
  on public.documents, public.report_documents, public.summary_report_documents
  to service_role;

alter table public.documents                enable row level security;
alter table public.report_documents         enable row level security;
alter table public.summary_report_documents enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'report_documents', 'summary_report_documents'
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
-- Storage
-- ---------------------------------------------------------------------------

-- Private, like site-photos and report-pdfs. A drawing or a RAMS is not
-- public information, and a public bucket would make every one of them
-- readable by anyone who learned the URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents',
  'project-documents',
  false,
  26214400, -- 25 MB: a drawing set is bigger than a photograph
  array['application/pdf']
)
on conflict (id) do nothing;

-- Same shape as the existing bucket policies: the leading folder of the object
-- name is the company id, and storage_company_id() extracts it.
create policy "project-documents_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-documents'
    and public.is_company_member(public.storage_company_id(name))
  );

create policy "project-documents_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and public.is_company_member(public.storage_company_id(name))
  );

create policy "project-documents_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-documents'
    and public.is_company_member(public.storage_company_id(name))
  )
  with check (
    bucket_id = 'project-documents'
    and public.is_company_member(public.storage_company_id(name))
  );

create policy "project-documents_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and public.is_company_member(public.storage_company_id(name))
  );
