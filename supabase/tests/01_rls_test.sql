-- SiteBoss Pro — schema and Row Level Security tests.
--
-- Run against a throwaway database that has had 00_supabase_stubs.sql and then
-- every file in supabase/migrations applied. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/01_rls_test.sql

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@empire-interiors.test',
   '{"full_name":"Alice Fenton","company_name":"Empire Interiors"}'::jsonb),
  (:'bob', 'bob@rival.test',
   '{"full_name":"Bob Grant","company_name":"Rival Groundworks"}'::jsonb);

do $$
declare
  n int;
begin
  select count(*) into n from public.companies;
  if n <> 2 then
    raise exception 'FAIL signup trigger: expected 2 companies, got %', n;
  end if;

  select count(*) into n from public.profiles where full_name = 'Alice Fenton';
  if n <> 1 then
    raise exception 'FAIL signup trigger: Alice profile not created';
  end if;

  select count(*) into n
    from public.company_members m
    join public.companies c on c.id = m.company_id
   where c.name = 'Empire Interiors' and m.role = 'owner';
  if n <> 1 then
    raise exception 'FAIL signup trigger: Alice is not owner of her company';
  end if;
end;
$$;

-- A user signing up without a company name still gets a company.
insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'solo@builder.test',
        '{"full_name":"Solo Builder"}'::jsonb);

do $$
declare
  n int;
begin
  select count(*) into n from public.companies where name = 'Solo Builder (Personal)';
  if n <> 1 then
    raise exception 'FAIL signup trigger: fallback company name not applied';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alice creates a project and reports
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.projects (company_id, name, client, site_address, project_reference, site_manager, created_by)
select m.company_id, 'Lidl South Croydon — External Works', 'Lidl GB',
       'South Croydon', '1470', 'Maciej', auth.uid()
  from public.company_members m
 where m.user_id = auth.uid();

do $$
declare
  n int;
begin
  select count(*) into n from public.projects;
  if n <> 1 then
    raise exception 'FAIL: Alice should see exactly her 1 project, saw %', n;
  end if;
end;
$$;

-- Report numbers are assigned sequentially per project by the trigger.
insert into public.reports (company_id, project_id, author_id, author_name)
select p.company_id, p.id, auth.uid(), 'Maciej' from public.projects p;
insert into public.reports (company_id, project_id, author_id, author_name)
select p.company_id, p.id, auth.uid(), 'Maciej' from public.projects p;
insert into public.reports (company_id, project_id, author_id, author_name)
select p.company_id, p.id, auth.uid(), 'Maciej' from public.projects p;

do $$
declare
  nums int[];
begin
  select array_agg(report_number order by report_number) into nums from public.reports;
  if nums <> array[1, 2, 3] then
    raise exception 'FAIL report numbering: expected {1,2,3}, got %', nums;
  end if;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Bob must not see or touch anything of Alice's
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.projects;
  if n <> 0 then
    raise exception 'FAIL isolation: Bob can see % of Alice''s projects', n;
  end if;

  select count(*) into n from public.reports;
  if n <> 0 then
    raise exception 'FAIL isolation: Bob can see % of Alice''s reports', n;
  end if;

  select count(*) into n from public.companies;
  if n <> 1 then
    raise exception 'FAIL isolation: Bob can see % companies, expected only his own', n;
  end if;
end;
$$;

-- Updates silently match no rows rather than leaking or mutating.
do $$
declare
  n int;
begin
  update public.projects set name = 'Hijacked';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL isolation: Bob updated % of Alice''s projects', n;
  end if;

  delete from public.projects;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL isolation: Bob deleted % of Alice''s projects', n;
  end if;
end;
$$;

-- Writing a row stamped with someone else's company id is refused.
do $$
declare
  alice_company uuid;
begin
  select company_id into alice_company
    from public.company_members
   where user_id = '11111111-1111-1111-1111-111111111111';

  begin
    insert into public.projects (company_id, name) values (alice_company, 'Trojan');
    raise exception 'FAIL isolation: Bob inserted a project into Alice''s company';
  exception
    when insufficient_privilege then null; -- expected
  end;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Composite foreign keys stop cross-company references even with RLS bypassed
-- ---------------------------------------------------------------------------

do $$
declare
  alice_project uuid;
  bob_company uuid;
begin
  select id into alice_project from public.projects limit 1;
  select company_id into bob_company
    from public.company_members
   where user_id = '22222222-2222-2222-2222-222222222222';

  begin
    insert into public.reports (company_id, project_id) values (bob_company, alice_project);
    raise exception 'FAIL: a report was attached to a project in another company';
  exception
    when foreign_key_violation then null; -- expected
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos: before/after pairing constraints
-- ---------------------------------------------------------------------------

do $$
declare
  p record;
  pair uuid := gen_random_uuid();
begin
  select id, company_id into p from public.projects limit 1;

  insert into public.photos (company_id, project_id, storage_path, category, pair_id, pair_role)
  values (p.company_id, p.id, 'a/b/before.jpg', 'before', pair, 'before');

  insert into public.photos (company_id, project_id, storage_path, category, pair_id, pair_role)
  values (p.company_id, p.id, 'a/b/after.jpg', 'after', pair, 'after');

  -- A pair holds at most one photo per role.
  begin
    insert into public.photos (company_id, project_id, storage_path, category, pair_id, pair_role)
    values (p.company_id, p.id, 'a/b/after2.jpg', 'after', pair, 'after');
    raise exception 'FAIL: a pair accepted two "after" photos';
  exception
    when unique_violation then null; -- expected
  end;

  -- pair_id and pair_role only make sense together.
  begin
    insert into public.photos (company_id, project_id, storage_path, pair_id)
    values (p.company_id, p.id, 'a/b/orphan.jpg', gen_random_uuid());
    raise exception 'FAIL: a photo accepted a pair_id with no pair_role';
  exception
    when check_violation then null; -- expected
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Issues outlive the report they were raised in
-- ---------------------------------------------------------------------------

do $$
declare
  p record;
  r uuid;
  remaining int;
  still_linked uuid;
begin
  select id, company_id into p from public.projects limit 1;
  select id into r from public.reports order by report_number desc limit 1;

  insert into public.issues (company_id, project_id, report_id, title, responsible, priority)
  values (p.company_id, p.id, r, 'Vehicle blocking rear gate', 'Client / Store', 'high');

  delete from public.reports where id = r;

  select count(*) into remaining from public.issues where title = 'Vehicle blocking rear gate';
  if remaining <> 1 then
    raise exception 'FAIL: deleting a report destroyed its issue';
  end if;

  select report_id into still_linked from public.issues where title = 'Vehicle blocking rear gate';
  if still_linked is not null then
    raise exception 'FAIL: issue still references the deleted report';
  end if;
end;
$$;

-- Deleting a report does take its own sections, workforce, plant and photos.
do $$
declare
  p record;
  r uuid;
  n int;
begin
  select id, company_id into p from public.projects limit 1;
  select id into r from public.reports order by report_number limit 1;

  insert into public.report_sections (company_id, report_id, section_type, content)
  values (p.company_id, r, 'executive_summary', 'Test summary');
  insert into public.workforce_entries (company_id, report_id, company_name, operatives)
  values (p.company_id, r, 'Empire Interiors', 4);
  insert into public.plant_entries (company_id, report_id, description)
  values (p.company_id, r, '8t excavator');
  insert into public.photos (company_id, project_id, report_id, storage_path)
  values (p.company_id, p.id, r, 'a/b/report-photo.jpg');

  delete from public.reports where id = r;

  select count(*) into n from public.report_sections where report_id = r;
  if n <> 0 then raise exception 'FAIL: report sections outlived their report'; end if;
  select count(*) into n from public.workforce_entries where report_id = r;
  if n <> 0 then raise exception 'FAIL: workforce entries outlived their report'; end if;
  select count(*) into n from public.plant_entries where report_id = r;
  if n <> 0 then raise exception 'FAIL: plant entries outlived their report'; end if;
  select count(*) into n from public.photos where report_id = r;
  if n <> 0 then raise exception 'FAIL: report photos outlived their report'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: a user may only write under their own company's folder
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  alice_company uuid;
  bob_company uuid;
begin
  select company_id into alice_company from public.company_members where user_id = auth.uid();
  select company_id into bob_company
    from public.company_members
   where user_id = '22222222-2222-2222-2222-222222222222';

  insert into storage.objects (bucket_id, name)
  values ('site-photos', alice_company || '/project/photo.jpg');

  begin
    insert into storage.objects (bucket_id, name)
    values ('site-photos', bob_company || '/project/photo.jpg');
    raise exception 'FAIL storage: Alice wrote into Bob''s company folder';
  exception
    when insufficient_privilege then null; -- expected
  end;

  -- Objects with a non-uuid leading folder are rejected rather than erroring.
  begin
    insert into storage.objects (bucket_id, name) values ('site-photos', 'loose-file.jpg');
    raise exception 'FAIL storage: an object outside any company folder was accepted';
  exception
    when insufficient_privilege then null; -- expected
  end;
end;
$$;

commit;

\echo '================================'
\echo ' ALL SCHEMA AND RLS TESTS PASSED'
\echo '================================'
