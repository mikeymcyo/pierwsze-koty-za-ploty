-- SiteBoss Pro - which documents the AI may read, and what reading them produced.
--
-- Runs after 01_rls_test.sql against the same throwaway database, so Alice,
-- her company and her project already exist. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/06_document_intelligence_test.sql

-- ---------------------------------------------------------------------------
-- The objects exist, with the shape the application relies on
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and c.relname in ('job_context_documents', 'document_extractions');
  if n <> 2 then raise exception 'FAIL: expected both Document Intelligence tables, found %', n; end if;

  select count(*) into n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'extraction_status';
  if n <> 5 then raise exception 'FAIL: extraction_status should have 5 values, found %', n; end if;

  -- Every status the application writes must be storable, and no other.
  perform 1 from unnest(array['pending','running','succeeded','failed','superseded']) v
   where not exists (
     select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'extraction_status' and e.enumlabel = v);
  if found then raise exception 'FAIL: extraction_status is missing a value the app writes'; end if;

  -- removed_at / removed_by are the history, and both must be nullable.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'job_context_documents'
     and column_name in ('removed_at', 'removed_by') and is_nullable = 'YES';
  if n <> 2 then raise exception 'FAIL: job_context_documents is missing its removal stamp'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security, the company policies, and nothing for anon
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
  ok boolean;
begin
  select bool_and(relrowsecurity) into ok from pg_class
   where relname in ('job_context_documents', 'document_extractions');
  if not ok then raise exception 'FAIL: row level security is not enabled on both tables'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('job_context_documents', 'document_extractions');
  if n <> 8 then raise exception 'FAIL: expected 4 company policies per table, found % in total', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where grantee = 'anon'
     and table_name in ('job_context_documents', 'document_extractions');
  if n <> 0 then raise exception 'FAIL: anon has % grants it should not have', n; end if;

  select count(distinct grantee) into n from information_schema.role_table_grants
   where grantee in ('authenticated', 'service_role')
     and table_name in ('job_context_documents', 'document_extractions')
     and privilege_type = 'SELECT';
  if n <> 2 then raise exception 'FAIL: authenticated or service_role cannot read the new tables'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Use as AI context: a removal is history, not a deletion
-- ---------------------------------------------------------------------------

do $$
declare
  company uuid;
  project uuid;
  document uuid;
  other uuid;
  person uuid;
  first_row uuid;
  n int;
begin
  select id into company from public.companies limit 1;
  select id into project from public.projects where company_id = company limit 1;
  select id into person from auth.users limit 1;

  insert into public.documents (company_id, project_id, storage_path, title, original_filename)
  values (company, project, company || '/' || project || '/po.pdf', 'Lidl PO 4501234567', 'po.pdf')
  returning id into document;

  -- Marked as context.
  insert into public.job_context_documents (company_id, document_id, added_by, note)
  values (company, document, person, 'The order this job was sent out on')
  returning id into first_row;

  -- Twice at once is a mistake, not a fact.
  begin
    insert into public.job_context_documents (company_id, document_id) values (company, document);
    raise exception 'FAIL: the same document was made AI context twice at once';
  exception when unique_violation then null;
  end;

  -- A context row cannot reach a document belonging to another company. Tried
  -- on a second, unmarked document so it is the tenancy key that rejects it and
  -- not the one-active index.
  insert into public.documents (company_id, project_id, storage_path, title, original_filename)
  values (company, project, company || '/' || project || '/rams.pdf', 'RAMS', 'rams.pdf')
  returning id into other;
  begin
    insert into public.job_context_documents (company_id, document_id)
    values (gen_random_uuid(), other);
    raise exception 'FAIL: a context row reached across companies';
  exception when foreign_key_violation then null;
  end;
  delete from public.documents where id = other;
  other := null;

  -- A half-filled removal is not a removal.
  begin
    update public.job_context_documents set removed_by = person where id = first_row;
    raise exception 'FAIL: removed_by was accepted with no removed_at';
  exception when check_violation then null;
  end;

  -- Nothing can be taken out before it was put in.
  begin
    update public.job_context_documents
       set removed_at = created_at - interval '1 day', removed_by = person
     where id = first_row;
    raise exception 'FAIL: a document stopped being context before it started';
  exception when check_violation then null;
  end;

  -- Taking it back out stamps the row. The row stays.
  update public.job_context_documents
     set removed_at = now(), removed_by = person
   where id = first_row;

  select count(*) into n from public.job_context_documents where id = first_row;
  if n <> 1 then raise exception 'FAIL: removing a document from AI context destroyed the record of it'; end if;

  -- ...and what it said about when and by whom is still there.
  perform 1 from public.job_context_documents
   where id = first_row
     and added_by = person and removed_by = person
     and created_at is not null and removed_at is not null
     and note = 'The order this job was sent out on';
  if not found then raise exception 'FAIL: the removed row lost when it became context or who ended it'; end if;

  -- Active context is removed_at is null, and this document is no longer it.
  select count(*) into n from public.job_context_documents
   where document_id = document and removed_at is null;
  if n <> 0 then raise exception 'FAIL: a removed document still reads as active AI context'; end if;

  -- Putting it back is an ordinary thing that happened, and is allowed to say so.
  insert into public.job_context_documents (company_id, document_id, added_by)
  values (company, document, person);

  select count(*) into n from public.job_context_documents where document_id = document;
  if n <> 2 then raise exception 'FAIL: expected both episodes on the record, found %', n; end if;

  select count(*) into n from public.job_context_documents
   where document_id = document and removed_at is null;
  if n <> 1 then raise exception 'FAIL: expected exactly one active context row, found %', n; end if;

  -- ---------------------------------------------------------------------------
  -- What reading the document produced
  -- ---------------------------------------------------------------------------

  -- A failure that does not say why cannot be stored.
  begin
    insert into public.document_extractions
      (company_id, document_id, source_storage_path, status, completed_at)
    values (company, document, 'po.pdf', 'failed', now());
    raise exception 'FAIL: an extraction failed silently';
  exception when check_violation then null;
  end;

  -- Finished means finished at a time.
  begin
    insert into public.document_extractions
      (company_id, document_id, source_storage_path, status)
    values (company, document, 'po.pdf', 'succeeded');
    raise exception 'FAIL: an extraction succeeded at no particular moment';
  exception when check_violation then null;
  end;

  -- The structured extraction is an object, not a list or a number.
  begin
    insert into public.document_extractions
      (company_id, document_id, source_storage_path, content)
    values (company, document, 'po.pdf', '[1, 2]'::jsonb);
    raise exception 'FAIL: content was accepted as something other than an object';
  exception when check_violation then null;
  end;

  -- One call in flight per document: a double tap cannot spend it twice.
  insert into public.document_extractions
    (company_id, document_id, source_storage_path, status, started_at)
  values (company, document, 'po.pdf', 'running', now());
  begin
    insert into public.document_extractions
      (company_id, document_id, source_storage_path, status)
    values (company, document, 'po.pdf', 'pending');
    raise exception 'FAIL: two extractions of one document were in flight at once';
  exception when unique_violation then null;
  end;

  update public.document_extractions
     set status = 'succeeded', completed_at = now(),
         content = '{"order_number": {"value": "4501234567", "page": 1, "quote": "Order 4501234567"}}'::jsonb,
         source_text = 'Order 4501234567', model = 'test', prompt_version = 'v1'
   where document_id = document;

  -- One current reading per document, so the AI context block never has to pick.
  begin
    insert into public.document_extractions
      (company_id, document_id, source_storage_path, status, completed_at)
    values (company, document, 'po.pdf', 'succeeded', now());
    raise exception 'FAIL: a document had two current extractions';
  exception when unique_violation then null;
  end;

  -- Re-reading supersedes the old reading and keeps it.
  update public.document_extractions
     set status = 'superseded' where document_id = document and status = 'succeeded';
  insert into public.document_extractions
    (company_id, document_id, source_storage_path, status, completed_at, model, prompt_version)
  values (company, document, 'po-rev-b.pdf', 'succeeded', now(), 'test', 'v2');

  select count(*) into n from public.document_extractions where document_id = document;
  if n <> 2 then raise exception 'FAIL: re-reading a document destroyed the earlier reading'; end if;

  -- The superseded row still says what it read and what read it, so a report
  -- drafted from it stays explainable.
  perform 1 from public.document_extractions
   where document_id = document and status = 'superseded'
     and source_text = 'Order 4501234567' and prompt_version = 'v1'
     and content -> 'order_number' ->> 'quote' = 'Order 4501234567';
  if not found then raise exception 'FAIL: the superseded reading lost what it read or what read it'; end if;

  -- updated_at is maintained.
  perform 1 from pg_trigger where tgname = 'document_extractions_set_updated_at';
  if not found then raise exception 'FAIL: document_extractions does not maintain updated_at'; end if;

  -- An extraction cannot reach a document in another company either.
  begin
    insert into public.document_extractions (company_id, document_id, source_storage_path)
    values (gen_random_uuid(), document, 'po.pdf');
    raise exception 'FAIL: an extraction reached across companies';
  exception when foreign_key_violation then null;
  end;

  -- ---------------------------------------------------------------------------
  -- Removing the document removes its readings and its context record
  -- ---------------------------------------------------------------------------

  delete from public.documents where id = document;

  select count(*) into n from public.document_extractions where document_id = document;
  if n <> 0 then raise exception 'FAIL: extractions outlived their document'; end if;
  select count(*) into n from public.job_context_documents where document_id = document;
  if n <> 0 then raise exception 'FAIL: context rows outlived their document'; end if;
end $$;

select 'document intelligence: OK' as result;
