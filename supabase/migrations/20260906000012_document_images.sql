-- Supporting documents may be photographs.
--
-- A site manager photographs a delivery note or a signed permit as often as
-- he is handed a PDF of one. The uploader (lib/documents/file-validation.ts)
-- checks the bytes and sets the content type from what it finds; the bucket's
-- allow-list is widened to match, and to nothing else. HEIC is deliberately
-- absent: it cannot be placed in the issued PDF without a conversion nothing
-- on the server does.
--
-- Additive: no object, row or policy changes. Applied to the hosted project
-- by explicit execution, never by db push.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'project-documents';
