-- SiteBoss Pro - linking a project to a place in a client's store directory.
--
-- Runs after 01_rls_test.sql against the same throwaway database, so Alice and
-- her company already exist. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/04_project_locations_test.sql

-- ---------------------------------------------------------------------------
-- The columns exist, are nullable, and are text
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  n int;
begin
  for r in
    select unnest(array['location_directory', 'location_code']) as column_name
  loop
    select count(*) into n from information_schema.columns
     where table_schema = 'public' and table_name = 'projects'
       and column_name = r.column_name and data_type = 'text' and is_nullable = 'YES';
    if n <> 1 then
      raise exception 'FAIL: projects.% missing, not text, or not nullable', r.column_name;
    end if;
  end loop;

  -- Nullable with no default is what keeps every existing project working.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'projects'
     and column_name in ('location_directory', 'location_code')
     and column_default is not null;
  if n <> 0 then raise exception 'FAIL: a location column has a default'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A project needs no store, and one entered before this existed is untouched
-- ---------------------------------------------------------------------------

do $$
declare
  alice_company uuid;
  unlinked uuid;
  n int;
begin
  select company_id into alice_company from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';

  insert into public.projects (company_id, name) values (alice_company, 'Walworth Road')
  returning id into unlinked;

  select count(*) into n from public.projects
   where id = unlinked and location_directory is null and location_code is null;
  if n <> 1 then raise exception 'FAIL: a project without a store did not save unlinked'; end if;

  -- And it can be linked afterwards, which is how an existing project adopts a store.
  update public.projects
     set location_directory = 'lidl-gb', location_code = '1470'
   where id = unlinked;

  select count(*) into n from public.projects
   where id = unlinked and location_directory = 'lidl-gb' and location_code = '1470';
  if n <> 1 then raise exception 'FAIL: an existing project could not be linked to a store'; end if;

  delete from public.projects where id = unlinked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Half a link is refused
--
-- A directory with nothing to look up in it, or a code with no directory to
-- look it up in, would both be a project claiming a place nobody can resolve.
-- ---------------------------------------------------------------------------

do $$
declare
  alice_company uuid;
begin
  select company_id into alice_company from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';

  begin
    insert into public.projects (company_id, name, location_directory)
    values (alice_company, 'Half a link', 'lidl-gb');
    raise exception 'FAIL: a directory with no code was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.projects (company_id, name, location_code)
    values (alice_company, 'Half a link', '1470');
    raise exception 'FAIL: a code with no directory was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.projects (company_id, name, location_directory, location_code)
    values (alice_company, 'Too long', repeat('x', 41), '1470');
    raise exception 'FAIL: an unbounded directory name was accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Two projects at one store, which is the whole point of keeping them apart
-- ---------------------------------------------------------------------------

do $$
declare
  alice_company uuid;
  n int;
begin
  select company_id into alice_company from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';

  insert into public.projects (company_id, name, location_directory, location_code, project_reference)
  values
    (alice_company, 'Replacement hoarding', 'lidl-gb', '1470', 'EI-2026-114'),
    (alice_company, 'Roof repairs', 'lidl-gb', '1470', 'EI-2026-207');

  select count(*) into n from public.projects
   where location_directory = 'lidl-gb' and location_code = '1470';
  if n <> 2 then
    raise exception 'FAIL: one store could not carry two projects, saw %', n;
  end if;

  -- The store number and the project reference are different numbers.
  select count(*) into n from public.projects
   where location_code = '1470' and project_reference = '1470';
  if n <> 0 then raise exception 'FAIL: a store number was written into a project reference'; end if;

  delete from public.projects where location_code = '1470';
end;
$$;

-- ---------------------------------------------------------------------------
-- The index is there, and nothing was opened up
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'projects' and indexname = 'projects_location_idx';
  if n <> 1 then raise exception 'FAIL: projects_location_idx is missing'; end if;

  -- Postgres checks the table grant before any policy, so this is the check
  -- that matters: adding columns must not have added a privilege.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'projects' and grantee = 'anon';
  if n <> 0 then raise exception 'FAIL: anon holds % grants on projects', n; end if;

  select count(*) into n from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'projects';
  if n <> 4 then
    raise exception 'FAIL: projects should still have exactly 4 policies, has %', n;
  end if;
end;
$$;

select 'project location tests passed' as result;
