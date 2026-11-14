-- SiteBoss Pro - Row Level Security.
--
-- Every table carries company_id, and every policy resolves it through
-- public.is_company_member(). A user can therefore never read or write a row
-- belonging to another company, regardless of what the application sends.

create or replace function public.is_company_owner(target_company_id uuid)
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
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- RLS decides which *rows* a user may touch, but PostgreSQL still checks
-- table-level GRANTs first. Tables created by a migration are owned by the
-- postgres role and carry no grants of their own, so without this block every
-- query from the app fails with "permission denied for table ...".
--
-- Nothing is granted to "anon": SiteBoss Pro has no anonymous data access.
--
-- "service_role" is Supabase's trusted server-side role. It carries BYPASSRLS,
-- so it is only ever used from server code holding the service role key - that
-- key must never be exposed to the browser.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.projects,
  public.reports,
  public.report_sections,
  public.workforce_entries,
  public.plant_entries,
  public.photos,
  public.issues
to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.companies to authenticated;
grant select on public.company_members to authenticated;

grant all on
  public.companies,
  public.company_members,
  public.profiles,
  public.projects,
  public.reports,
  public.report_sections,
  public.workforce_entries,
  public.plant_entries,
  public.photos,
  public.issues
to service_role;

grant execute on function public.is_company_member(uuid) to authenticated, service_role;
grant execute on function public.is_company_owner(uuid) to authenticated, service_role;
grant execute on function public.shares_company_with(uuid) to authenticated, service_role;

alter table public.companies        enable row level security;
alter table public.company_members  enable row level security;
alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.reports          enable row level security;
alter table public.report_sections  enable row level security;
alter table public.workforce_entries enable row level security;
alter table public.plant_entries    enable row level security;
alter table public.photos           enable row level security;
alter table public.issues           enable row level security;

-- ---------------------------------------------------------------------------
-- companies - readable by members, renameable by owners. Rows are created by
-- the signup trigger only, so there is deliberately no insert or delete policy.
-- ---------------------------------------------------------------------------

create policy "companies_select_members" on public.companies
  for select to authenticated
  using (public.is_company_member(id));

create policy "companies_update_owners" on public.companies
  for update to authenticated
  using (public.is_company_owner(id))
  with check (public.is_company_owner(id));

-- ---------------------------------------------------------------------------
-- company_members - read-only from the client in the MVP. Team invitations are
-- a later phase and will add write policies then.
-- ---------------------------------------------------------------------------

create policy "company_members_select_own_company" on public.company_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "profiles_select_self_or_colleague" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id));

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Company-scoped tables. Identical shape for each: full CRUD within your own
-- company, nothing at all outside it.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'reports', 'report_sections', 'workforce_entries',
    'plant_entries', 'photos', 'issues'
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
