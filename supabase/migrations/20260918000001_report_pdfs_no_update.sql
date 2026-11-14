-- Issued PDFs are written once. Nothing updates them; nothing may.
--
-- 20260826000003_storage.sql made select, insert, update and delete policies
-- for both buckets in one loop. Nothing in the application updates an object
-- in report-pdfs: both finalise actions upload with upsert: false under a
-- timestamped name, re-issuing writes a new object, and the only other
-- operations are download, createSignedUrl and remove. The update grant
-- therefore let any company member replace the bytes behind an issued
-- report's pdf_path from the browser while the row stayed final.
--
-- Only the update policy goes. Delete stays: the report, summary and project
-- delete actions run through the signed-in user's storage client and need it.
-- No other policy, bucket or table is touched.

drop policy if exists "report-pdfs_update" on storage.objects;

-- Rollback, if ever needed:
-- create policy "report-pdfs_update" on storage.objects
--   for update to authenticated
--   using (bucket_id = 'report-pdfs' and public.is_company_member(public.storage_company_id(name)))
--   with check (bucket_id = 'report-pdfs' and public.is_company_member(public.storage_company_id(name)));
