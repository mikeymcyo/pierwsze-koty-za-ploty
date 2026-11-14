-- SiteBoss Pro - remove every privilege from the anonymous role.
--
-- SiteBoss Pro has no anonymous data access: you are signed in or you see
-- nothing. Migration 2 grants "authenticated" and "service_role" explicitly and
-- never mentions "anon", but that is not enough on its own.
--
-- Hosted Supabase projects carry ALTER DEFAULT PRIVILEGES rules that grant new
-- tables in the public schema to anon automatically, and those rules apply to
-- anything created by the postgres role - which is what the SQL Editor runs as.
-- A table created there therefore starts out readable by anon, while the same
-- migration applied through the CLI does not. Row Level Security still returns
-- no rows, because every policy in migration 2 is declared "to authenticated"
-- and anon has no policy at all, so nothing leaks either way.
--
-- The risk this closes is a future one: a policy written without a role
-- restriction (for example "using (true)" for select) would immediately be
-- readable by anon if the underlying table grant were still in place. Revoking
-- makes the intent explicit and the behaviour identical on every platform.
--
-- Safe to run more than once, and safe to run on a project where the earlier
-- migrations are already applied.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

-- Stop future tables in this schema from being granted to anon by default.
-- Written for both role contexts, since which one owns new objects depends on
-- whether a migration is applied through the SQL Editor or the CLI.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
  execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon';
  execute 'alter default privileges for role postgres in schema public revoke all on functions from anon';
exception
  when insufficient_privilege then
    -- Not the owner of the postgres role's defaults; the statements above still
    -- cover objects created in this session's role context.
    null;
end;
$$;
