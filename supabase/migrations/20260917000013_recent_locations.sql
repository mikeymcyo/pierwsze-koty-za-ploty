-- SiteBoss Pro - recent locations.
--
-- The stores a person opened or asked directions to, newest first, so a
-- store looked up on Monday for a possible job is one tap away on Thursday
-- rather than another search from a text message. Personal history, not
-- company data: the row holds only the keys of shipped reference data (the
-- directory id and the store code) and a time, and is readable and writable
-- by its own user alone. Nothing here is a lead, a note or a CRM.
--
-- Applied through the controlled migration path, 2026-09-17. Rollback:
--   drop table public.recent_locations;

create table public.recent_locations (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  directory  text        not null,
  code       text        not null,
  visited_at timestamptz not null default now(),
  -- One row per store per person: a revisit updates visited_at rather than
  -- adding a second row, which is what makes "newest first" also "no duplicates".
  primary key (user_id, directory, code)
);

comment on table public.recent_locations is
  'Stores a user recently opened or asked directions to. Keys of shipped reference data only; one row per user and store; personal, not company, data.';

create index recent_locations_user_visited_idx
  on public.recent_locations (user_id, visited_at desc);

alter table public.recent_locations enable row level security;

create policy "recent_locations_select_self" on public.recent_locations
  for select to authenticated
  using (user_id = auth.uid());

create policy "recent_locations_insert_self" on public.recent_locations
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "recent_locations_update_self" on public.recent_locations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "recent_locations_delete_self" on public.recent_locations
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.recent_locations to authenticated;
revoke all on public.recent_locations from anon;
