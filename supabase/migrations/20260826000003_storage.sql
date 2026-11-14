-- SiteBoss Pro - private storage buckets.
--
-- Object paths are always "{company_id}/{project_id}/{filename}", and access is
-- granted by matching the leading folder against the caller's company.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'site-photos',
    'site-photos',
    false,
    -- Photos are compressed on the device before upload; this is a safety net.
    15728640, -- 15 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'report-pdfs',
    'report-pdfs',
    false,
    52428800, -- 50 MB
    array['application/pdf']
  )
on conflict (id) do nothing;

-- Reads the leading path segment as a company id, returning null (rather than
-- raising) for any object whose name does not start with a uuid folder.
create or replace function public.storage_company_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function public.storage_company_id(text) to authenticated, service_role;

do $$
declare
  b text;
begin
  foreach b in array array['site-photos', 'report-pdfs']
  loop
    execute format($p$
      create policy %1$I on storage.objects
        for select to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_select', b);

    execute format($p$
      create policy %1$I on storage.objects
        for insert to authenticated
        with check (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_insert', b);

    execute format($p$
      create policy %1$I on storage.objects
        for update to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        )
        with check (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_update', b);

    execute format($p$
      create policy %1$I on storage.objects
        for delete to authenticated
        using (
          bucket_id = %2$L
          and public.is_company_member(public.storage_company_id(name))
        );
    $p$, b || '_delete', b);
  end loop;
end;
$$;
