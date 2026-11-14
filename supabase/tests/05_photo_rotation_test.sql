-- SiteBoss Pro - which way up a photograph is printed.
--
-- Runs after 01_rls_test.sql against the same throwaway database, so Alice,
-- her company and her project already exist. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/05_photo_rotation_test.sql

-- ---------------------------------------------------------------------------
-- The column exists, is a smallint, is NOT NULL, and defaults to 0
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'photos'
     and column_name = 'rotation' and data_type = 'smallint' and is_nullable = 'NO';
  if n <> 1 then
    raise exception 'FAIL: photos.rotation missing, not smallint, or nullable';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'photos'
     and column_name = 'rotation' and column_default like '0%';
  if n <> 1 then
    raise exception 'FAIL: photos.rotation does not default to 0';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A photograph stored before this existed reads as 0, and looks as uploaded
-- ---------------------------------------------------------------------------

do $$
declare
  company uuid;
  project uuid;
  photo uuid;
  turn smallint;
begin
  select id into company from public.companies limit 1;
  select id into project from public.projects where company_id = company limit 1;

  insert into public.photos (company_id, project_id, storage_path)
  values (company, project, 'test/rotation/as-uploaded.jpg')
  returning id into photo;

  select rotation into turn from public.photos where id = photo;
  if turn is distinct from 0 then
    raise exception 'FAIL: a new photograph should be 0 degrees, got %', turn;
  end if;

  -- ---------------------------------------------------------------------------
  -- Only quarter turns are storable
  -- ---------------------------------------------------------------------------

  update public.photos set rotation = 90 where id = photo;
  update public.photos set rotation = 180 where id = photo;
  update public.photos set rotation = 270 where id = photo;
  update public.photos set rotation = 0 where id = photo;

  begin
    update public.photos set rotation = 45 where id = photo;
    raise exception 'FAIL: 45 degrees should be refused';
  exception
    when check_violation then null;
  end;

  begin
    update public.photos set rotation = -90 where id = photo;
    raise exception 'FAIL: a negative turn should be refused - the application wraps it first';
  exception
    when check_violation then null;
  end;

  begin
    update public.photos set rotation = 360 where id = photo;
    raise exception 'FAIL: 360 should be refused - a full turn is 0';
  exception
    when check_violation then null;
  end;

  -- ---------------------------------------------------------------------------
  -- Nothing else on the row moved
  -- ---------------------------------------------------------------------------

  update public.photos
     set caption = 'Cracking to the plaster', category = 'defect', rotation = 90
   where id = photo;

  perform 1 from public.photos
   where id = photo
     and caption = 'Cracking to the plaster'
     and category = 'defect'
     and rotation = 90
     and storage_path = 'test/rotation/as-uploaded.jpg';
  if not found then
    raise exception 'FAIL: rotating a photograph disturbed its caption, status or file';
  end if;

  delete from public.photos where id = photo;
end $$;

select 'photo rotation: OK' as result;
