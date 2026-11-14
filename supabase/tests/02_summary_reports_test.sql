-- SiteBoss Pro - progress/completion report schema and issue history tests.
--
-- Runs after 01_rls_test.sql against the same throwaway database, so Alice and
-- Bob and their companies already exist. Any failure raises and aborts.
--
--   psql -v ON_ERROR_STOP=1 -d sbtest -f supabase/tests/02_summary_reports_test.sql

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

-- ---------------------------------------------------------------------------
-- Enums exist with the values the application relies on
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n from pg_type where typname = 'summary_report_kind';
  if n <> 1 then raise exception 'FAIL enum: summary_report_kind missing'; end if;

  select count(*) into n from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'summary_report_kind';
  -- progress, completion, survey.
  if n <> 3 then raise exception 'FAIL enum: summary_report_kind has % values, expected 3', n; end if;

  select count(*) into n from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'summary_section_type';
  -- 14 for progress and completion, plus 7 for the site survey.
  -- 21, plus 'instructed_works' from 20260901000011.
  if n <> 22 then raise exception 'FAIL enum: summary_section_type has % values, expected 22', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'issues' and column_name = 'resolution';
  if n <> 1 then raise exception 'FAIL: issues.resolution was not added'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Every new table has RLS on, and grants for authenticated
--
-- Postgres checks the table grant before it ever reaches a policy, so a table
-- with perfect policies and no grant fails every query (F1).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  n int;
begin
  foreach t in array array[
    'summary_reports', 'summary_report_sections', 'summary_report_sources',
    'summary_report_photos', 'summary_report_issues', 'issue_events'
  ]
  loop
    select count(*) into n from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t and c.relrowsecurity;
    if n <> 1 then raise exception 'FAIL rls: % does not have row level security enabled', t; end if;

    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = t
       and grantee = 'authenticated' and privilege_type = 'SELECT';
    if n <> 1 then raise exception 'FAIL grant: authenticated cannot select from %', t; end if;

    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = t and grantee = 'anon';
    if n <> 0 then raise exception 'FAIL anon: % is still granted to anon', t; end if;
  end loop;

  -- issue_events is deliberately read-only from the client: history that can be
  -- rewritten is not history.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'issue_events'
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then raise exception 'FAIL: authenticated can write issue_events directly'; end if;

  -- and the write policies to match: select only.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'issue_events';
  if n <> 1 then raise exception 'FAIL: issue_events has % policies, expected 1 (select)', n; end if;

  foreach t in array array[
    'summary_reports', 'summary_report_sections', 'summary_report_sources',
    'summary_report_photos', 'summary_report_issues'
  ]
  loop
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n <> 4 then raise exception 'FAIL: % has % policies, expected 4', t, n; end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alice: numbering, constraints, provenance, issue history
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- Numbering runs per project AND per kind, so progress and completion reports
-- never disturb each other or the daily sequence.
insert into public.summary_reports (company_id, project_id, kind, period_start, period_end, created_by)
select p.company_id, p.id, 'progress', date '2026-08-24', date '2026-08-28', auth.uid()
  from public.projects p where p.name like 'Lidl%' limit 1;

insert into public.summary_reports (company_id, project_id, kind, period_start, period_end, created_by)
select p.company_id, p.id, 'progress', date '2026-08-31', date '2026-09-04', auth.uid()
  from public.projects p where p.name like 'Lidl%' limit 1;

insert into public.summary_reports (company_id, project_id, kind, created_by)
select p.company_id, p.id, 'completion', auth.uid()
  from public.projects p where p.name like 'Lidl%' limit 1;

do $$
declare
  n int;
begin
  select number into n from public.summary_reports
   where kind = 'progress' and period_start = date '2026-08-24';
  if n <> 1 then raise exception 'FAIL numbering: first progress report is %, expected 1', n; end if;

  select number into n from public.summary_reports
   where kind = 'progress' and period_start = date '2026-08-31';
  if n <> 2 then raise exception 'FAIL numbering: second progress report is %, expected 2', n; end if;

  -- A different kind starts its own sequence rather than continuing.
  select number into n from public.summary_reports where kind = 'completion';
  if n <> 1 then raise exception 'FAIL numbering: completion report is %, expected 1', n; end if;

end;
$$;

-- The daily sequence runs on regardless: a new daily report picks up where the
-- daily numbering left off, entirely unaffected by the three summary reports
-- created above.
do $$
declare
  before_max int;
  after_max int;
begin
  select coalesce(max(report_number), 0) into before_max from public.reports;

  insert into public.reports (company_id, project_id, report_date, author_id)
  select p.company_id, p.id, current_date, auth.uid()
    from public.projects p where p.name like 'Lidl%' limit 1;

  select coalesce(max(report_number), 0) into after_max from public.reports;

  if after_max <> before_max + 1 then
    raise exception 'FAIL numbering: daily went from % to %, expected %',
      before_max, after_max, before_max + 1;
  end if;
end;
$$;

-- A period is both dates or neither.
do $$
begin
  insert into public.summary_reports (company_id, project_id, kind, period_start, created_by)
  select p.company_id, p.id, 'progress', date '2026-08-24', auth.uid()
    from public.projects p where p.name like 'Lidl%' limit 1;
  raise exception 'FAIL constraint: a half-open period was accepted';
exception
  when check_violation then null;
end;
$$;

-- A finalised summary report must carry its issued PDF and the date it was
-- issued. The snapshot rule, enforced by the schema and not only by the code.
do $$
begin
  update public.summary_reports set status = 'final' where kind = 'completion';
  raise exception 'FAIL constraint: a report went final with no pdf_path or finalised_at';
exception
  when check_violation then null;
end;
$$;

do $$
begin
  update public.summary_reports
     set status = 'final', pdf_path = 'c/p/report.pdf'
   where kind = 'completion';
  raise exception 'FAIL constraint: a report went final with no finalised_at';
exception
  when check_violation then null;
end;
$$;

update public.summary_reports
   set status = 'final', pdf_path = 'c/p/report.pdf', finalised_at = now()
 where kind = 'progress' and number = 1;

do $$
declare
  n int;
begin
  select count(*) into n from public.summary_reports
   where status = 'final' and pdf_path is not null and finalised_at is not null;
  if n <> 1 then raise exception 'FAIL: a complete finalisation was rejected'; end if;
end;
$$;

-- The self-referencing composite key: a revision points at what it supersedes.
insert into public.summary_reports
  (company_id, project_id, kind, number, revision, supersedes_id, period_start, period_end, created_by)
select s.company_id, s.project_id, 'progress', s.number, 1, s.id,
       s.period_start, s.period_end, auth.uid()
  from public.summary_reports s
 where s.kind = 'progress' and s.number = 1 and s.revision = 0;

do $$
declare
  n int;
begin
  select count(*) into n from public.summary_reports
   where revision = 1 and supersedes_id is not null;
  if n <> 1 then raise exception 'FAIL: a revision could not reference what it supersedes'; end if;

  -- Same number, different revision: allowed. That is what the unique key is for.
  select count(*) into n from public.summary_reports where kind = 'progress' and number = 1;
  if n <> 2 then raise exception 'FAIL: number+revision uniqueness is wrong, saw % rows', n; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provenance: direct daily, progress source, and daily-via-progress
-- ---------------------------------------------------------------------------

insert into public.summary_report_sources (company_id, summary_report_id, report_id)
select s.company_id, s.id, r.id
  from public.summary_reports s
  cross join lateral (select id from public.reports order by report_number limit 1) r
 where s.kind = 'completion';

insert into public.summary_report_sources (company_id, summary_report_id, source_summary_report_id)
select c.company_id, c.id, p.id
  from public.summary_reports c
  join public.summary_reports p on p.kind = 'progress' and p.number = 1 and p.revision = 0
 where c.kind = 'completion';

-- The same daily, reached through that progress report. A completion report
-- that prefers the reviewed narrative must still name the evidence under it.
insert into public.summary_report_sources
  (company_id, summary_report_id, report_id, via_summary_report_id)
select c.company_id, c.id, r.id, p.id
  from public.summary_reports c
  join public.summary_reports p on p.kind = 'progress' and p.number = 1 and p.revision = 0
  cross join lateral (select id from public.reports order by report_number offset 1 limit 1) r
 where c.kind = 'completion';

do $$
declare
  n int;
begin
  select count(*) into n from public.summary_report_sources where report_id is not null and via_summary_report_id is null;
  if n <> 1 then raise exception 'FAIL provenance: direct daily source, saw %', n; end if;

  select count(*) into n from public.summary_report_sources where source_summary_report_id is not null;
  if n <> 1 then raise exception 'FAIL provenance: progress report source, saw %', n; end if;

  select count(*) into n from public.summary_report_sources where via_summary_report_id is not null;
  if n <> 1 then raise exception 'FAIL provenance: daily-via-progress source, saw %', n; end if;
end;
$$;

-- A source names one thing or the other, never both and never neither.
do $$
begin
  insert into public.summary_report_sources (company_id, summary_report_id, report_id, source_summary_report_id)
  select s.company_id, s.id, r.id, s.id
    from public.summary_reports s
    cross join lateral (select id from public.reports limit 1) r
   where s.kind = 'completion';
  raise exception 'FAIL constraint: a source named both a daily and a summary report';
exception
  when check_violation then null;
end;
$$;

do $$
begin
  insert into public.summary_report_sources (company_id, summary_report_id)
  select s.company_id, s.id from public.summary_reports s where s.kind = 'completion';
  raise exception 'FAIL constraint: a source named nothing at all';
exception
  when check_violation then null;
end;
$$;

-- Provenance only means something for a daily reached through a summary.
do $$
begin
  insert into public.summary_report_sources
    (company_id, summary_report_id, source_summary_report_id, via_summary_report_id)
  select c.company_id, c.id, p.id, p.id
    from public.summary_reports c
    join public.summary_reports p on p.kind = 'progress' and p.number = 2
   where c.kind = 'completion';
  raise exception 'FAIL constraint: via was accepted without a daily report';
exception
  when check_violation then null;
end;
$$;

-- The same daily cannot be counted twice in one report.
do $$
begin
  insert into public.summary_report_sources (company_id, summary_report_id, report_id)
  select s.company_id, s.id, r.id
    from public.summary_reports s
    cross join lateral (select id from public.reports order by report_number limit 1) r
   where s.kind = 'completion';
  raise exception 'FAIL: a daily report was recorded twice as a source';
exception
  when unique_violation then null;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Issue history: raised, moved, closed - written by the trigger
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

insert into public.issues (company_id, project_id, title, priority, created_by)
select p.company_id, p.id, 'Drainage blocked by stored materials', 'high', auth.uid()
  from public.projects p where p.name like 'Lidl%' limit 1;

do $$
declare
  n int;
  t public.issue_status;
begin
  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';
  if n <> 1 then raise exception 'FAIL history: raising an issue recorded % events, expected 1', n; end if;

  select e.to_status into t from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';
  if t <> 'open' then raise exception 'FAIL history: an issue was raised as %, expected open', t; end if;
end;
$$;

update public.issues set status = 'in_progress' where title like 'Drainage%';
update public.issues set status = 'closed', closed_at = now(), resolution = 'Materials moved and the run rodded through.'
 where title like 'Drainage%';

do $$
declare
  n int;
  path text;
begin
  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';
  if n <> 3 then raise exception 'FAIL history: expected 3 events, saw %', n; end if;

  select string_agg(coalesce(e.from_status::text, 'none') || '>' || e.to_status::text, ',' order by e.created_at)
    into path
    from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';

  if path <> 'none>open,open>in_progress,in_progress>closed' then
    raise exception 'FAIL history: transitions were %', path;
  end if;
end;
$$;

-- An update that does not touch status writes no event.
update public.issues set responsible = 'Groundworks Ltd' where title like 'Drainage%';

do $$
declare
  n int;
begin
  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';
  if n <> 3 then raise exception 'FAIL history: a non-status edit recorded an event'; end if;
end;
$$;

-- History cannot be rewritten from the client.
do $$
begin
  delete from public.issue_events;
  raise exception 'FAIL: authenticated deleted issue history';
exception
  when insufficient_privilege then null;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Tenant isolation: Bob sees none of it, and cannot reach into it
-- ---------------------------------------------------------------------------

-- Captured as the superuser before switching roles: RLS hides Alice's report
-- from Bob, which is the point, but the test still needs its id to aim at.
select id as completion_id from public.summary_reports where kind = 'completion' limit 1
\gset

-- Carried in a session setting rather than a psql variable: psql does not
-- interpolate inside a dollar-quoted block, and the attempt below has to be
-- made from inside one to catch the violation it should raise.
\o /dev/null
select set_config('siteboss.completion_id', :'completion_id', false);
\o

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.summary_reports;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see % summary reports', n; end if;

  select count(*) into n from public.summary_report_sources;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see the evidence trail'; end if;

  select count(*) into n from public.issue_events;
  if n <> 0 then raise exception 'FAIL isolation: Bob can see another company issue history'; end if;
end;
$$;

-- Bob gets a project and a photo of his own, so the attempt below is a real
-- one: the same statement Alice's screen would run, with his own company_id
-- and his own photo, aimed at her report.
insert into public.projects (company_id, name, created_by)
select m.company_id, 'Rival Yard', auth.uid()
  from public.company_members m where m.user_id = auth.uid();

insert into public.photos (company_id, project_id, storage_path, category, uploaded_by)
select p.company_id, p.id, p.company_id::text || '/' || p.id::text || '/rival.jpg', 'general', auth.uid()
  from public.projects p where p.name = 'Rival Yard';

-- The composite foreign key is a second, independent barrier: even with a
-- company_id he is entitled to and a photo he owns, the report is not his, and
-- (summary_report_id, company_id) has nothing to point at.
do $$
declare
  affected int;
begin
  insert into public.summary_report_photos (company_id, summary_report_id, photo_id)
  select m.company_id, current_setting('siteboss.completion_id')::uuid, ph.id
    from public.company_members m
    join public.photos ph on ph.company_id = m.company_id
   where m.user_id = auth.uid();

  get diagnostics affected = row_count;
  raise exception 'FAIL isolation: Bob curated % photo(s) onto another company report', affected;
exception
  when foreign_key_violation then null;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- The backfill: existing issues get a reconstructed history
--
-- Simulated by inserting rows with the trigger disabled, exactly as issues
-- created before this migration existed, then running the same statements the
-- migration runs.
-- ---------------------------------------------------------------------------

alter table public.issues disable trigger issues_record_event;

insert into public.issues (company_id, project_id, title, status, priority, created_at, updated_at)
select p.company_id, p.id, 'Legacy open issue', 'open', 'medium',
       now() - interval '10 days', now() - interval '10 days'
  from public.projects p where p.name like 'Lidl%' limit 1;

insert into public.issues (company_id, project_id, title, status, priority, closed_at, created_at, updated_at)
select p.company_id, p.id, 'Legacy closed issue', 'closed', 'low',
       now() - interval '2 days', now() - interval '9 days', now() - interval '2 days'
  from public.projects p where p.name like 'Lidl%' limit 1;

alter table public.issues enable trigger issues_record_event;

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

do $$
declare
  n int;
begin
  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title = 'Legacy open issue';
  if n <> 1 then raise exception 'FAIL backfill: open issue got % events, expected 1', n; end if;

  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title = 'Legacy closed issue';
  if n <> 2 then raise exception 'FAIL backfill: closed issue got % events, expected 2', n; end if;

  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title = 'Legacy closed issue' and e.to_status = 'closed' and e.from_status = 'open';
  if n <> 1 then raise exception 'FAIL backfill: the closing transition was not reconstructed'; end if;

  -- The issue that already had history through the trigger is not touched.
  select count(*) into n from public.issue_events e
    join public.issues i on i.id = e.issue_id
   where i.title like 'Drainage%';
  if n <> 3 then raise exception 'FAIL backfill: it rewrote an issue that already had history'; end if;

  -- Every backfilled row says it is a reconstruction, and only the two legacy
  -- issues were reconstructed.
  select count(*) into n from public.issue_events
   where note = 'Backfilled when issue history was introduced';
  if n <> 3 then raise exception 'FAIL backfill: expected 3 reconstructed rows, saw %', n; end if;
end;
$$;

-- Running it twice changes nothing. Counted rather than compared against a
-- fixed number, because what else is in the database depends on the tests that
-- ran before this one.
do $$
begin
  perform set_config('siteboss.events_before',
                     (select count(*)::text from public.issue_events), false);
end;
$$;

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

do $$
declare
  n int;
  was int;
begin
  select count(*) into n from public.issue_events;
  was := current_setting('siteboss.events_before')::int;
  if n <> was then
    raise exception 'FAIL backfill: re-running it changed the history, % rows became %', was, n;
  end if;
end;
$$;

select 'SUMMARY REPORT SCHEMA TESTS PASSED' as result;
