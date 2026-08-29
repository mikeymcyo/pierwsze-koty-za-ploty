-- SiteBoss Pro - supporting document schema, isolation and provenance tests.
--
-- Runs after 01_rls_test.sql against the same throwaway database, so Alice and
-- Bob and their companies already exist. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/03_documents_test.sql

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

-- ---------------------------------------------------------------------------
-- The enum and the tables exist as the application expects
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from pg_type where typname = 'document_type';
  if n <> 1 then raise exception 'FAIL enum: document_type missing'; end if;

  select count(*) into n from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'document_type';
  if n <> 10 then raise exception 'FAIL enum: document_type has % values, expected 10', n; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS is on and authenticated is granted - the F1 trap
--
-- Postgres checks the table grant before any policy, so a table with perfect
-- policies and no grant fails every query with "permission denied".
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  n int;
begin
  foreach t in array array['documents', 'report_documents', 'summary_report_documents']
  loop
    select count(*) into n from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t and c.relrowsecurity;
    if n <> 1 then raise exception 'FAIL rls: % does not have row level security on', t; end if;

    select count(*) into n from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t;
    if n <> 4 then raise exception 'FAIL policy: % has % policies, expected 4', t, n; end if;

    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = t and grantee = 'authenticated';
    if n < 4 then raise exception 'FAIL grant: authenticated cannot use % (F1)', t; end if;

    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = t and grantee = 'anon';
    if n <> 0 then raise exception 'FAIL grant: anon can reach %', t; end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alice uploads a document and references it from a report
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  alice_company uuid;
  alice_project uuid;
  alice_report uuid;
  doc uuid;
  n int;
begin
  select company_id into alice_company from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';
  select id into alice_project from public.projects where company_id = alice_company limit 1;

  -- A fixed id so the cross-tenant block below can name this exact document.
  doc := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  insert into public.documents (id, company_id, project_id, storage_path, title, original_filename, doc_type, reference, revision)
  values (doc, alice_company, alice_project, alice_company || '/' || alice_project || '/ga-plan.pdf',
          'GA Plan', 'GA-Plan-Rev-C.pdf', 'drawing', 'A-100', 'C');

  insert into public.reports (company_id, project_id) values (alice_company, alice_project)
  returning id into alice_report;

  insert into public.report_documents (company_id, report_id, document_id)
  values (alice_company, alice_report, doc);

  select count(*) into n from public.report_documents where report_id = alice_report;
  if n <> 1 then raise exception 'FAIL: the report does not reference its document'; end if;

  -- The same document twice on one report is a mistake, not a fact.
  begin
    insert into public.report_documents (company_id, report_id, document_id)
    values (alice_company, alice_report, doc);
    raise exception 'FAIL: a document was referenced twice by one report';
  exception when unique_violation then
    null;
  end;

  -- Removing the reference must leave the document itself alone.
  delete from public.report_documents where report_id = alice_report and document_id = doc;
  select count(*) into n from public.documents where id = doc;
  if n <> 1 then raise exception 'FAIL: removing a reference deleted the project document'; end if;

  -- Put it back, and snapshot it as finalising would.
  insert into public.report_documents
    (company_id, report_id, document_id, title_at_issue, type_at_issue, reference_at_issue, revision_at_issue)
  values (alice_company, alice_report, doc, 'GA Plan', 'drawing', 'A-100', 'C');

  -- The drawing is superseded. The issued reference must not follow it.
  update public.documents set title = 'GA Plan (superseded)', revision = 'D' where id = doc;

  select count(*) into n from public.report_documents
   where report_id = alice_report and revision_at_issue = 'C' and title_at_issue = 'GA Plan';
  if n <> 1 then raise exception 'FAIL: the issued snapshot moved with the live document'; end if;
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- Bob can see none of it, and cannot reach across companies
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

do $$
declare
  bob_company uuid;
  n int;
begin
  select company_id into bob_company from public.company_members
   where user_id = '22222222-2222-2222-2222-222222222222';

  select count(*) into n from public.documents;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see % of Alice''s documents', n; end if;

  select count(*) into n from public.report_documents;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see Alice''s document references'; end if;

  -- Claiming another company's id is refused by the insert policy.
  begin
    insert into public.documents (company_id, project_id, storage_path, title, original_filename)
    select '33333333-3333-3333-3333-333333333333', p.id, 'x/y/z.pdf', 'Stolen', 'stolen.pdf'
      from public.projects p where p.company_id = bob_company limit 1;
    raise exception 'FAIL isolation: Bob inserted a document under a company that is not his';
  exception when insufficient_privilege or foreign_key_violation then
    null;
  end;

  -- Referencing Alice's document from his own report must fail: the composite
  -- foreign key requires the document to exist inside Bob's own company.
  begin
    insert into public.reports (company_id, project_id)
    select bob_company, p.id from public.projects p where p.company_id = bob_company limit 1;

    insert into public.report_documents (company_id, report_id, document_id)
    select bob_company, r.id, 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      from public.reports r where r.company_id = bob_company limit 1;
    raise exception 'FAIL isolation: Bob referenced a document belonging to Alice';
  exception when foreign_key_violation then
    null;
  end;

  -- And Alice's own document is untouched by any of it.
  select count(*) into n from public.report_documents;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see document references'; end if;
end;
$$;
commit;

-- ---------------------------------------------------------------------------
-- Deleting a project takes its documents with it, and nothing else does
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  alice_company uuid;
  scratch_project uuid;
  doc uuid;
  n int;
begin
  select company_id into alice_company from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';

  insert into public.projects (company_id, name) values (alice_company, 'Scratch')
  returning id into scratch_project;

  insert into public.documents (company_id, project_id, storage_path, title, original_filename)
  values (alice_company, scratch_project, alice_company || '/' || scratch_project || '/x.pdf', 'X', 'x.pdf')
  returning id into doc;

  delete from public.projects where id = scratch_project;

  select count(*) into n from public.documents where id = doc;
  if n <> 0 then raise exception 'FAIL: deleting a project left its documents behind'; end if;
end;
$$;
commit;

select 'documents tests passed' as result;
