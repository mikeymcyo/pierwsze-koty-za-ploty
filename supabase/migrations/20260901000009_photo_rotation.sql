-- Which way up a photograph is printed.
--
-- One column and one check constraint. No table, no policy, no index, no
-- trigger, no backfill, and no existing row changes: the column defaults to 0,
-- 0 means "as uploaded", and every photograph already stored therefore prints
-- exactly as it printed before this ran.
--
-- ---------------------------------------------------------------------------
-- Why a column and not a rewritten file
-- ---------------------------------------------------------------------------
--
-- A site photograph is evidence. The object in storage is what came off the
-- camera, and a report may be read next to it a year later in a dispute about
-- what a wall looked like on a Tuesday. Rotating by re-encoding would replace
-- that object with a lossy copy, or duplicate it and leave two files claiming
-- to be the same evidence - so nothing here touches storage at all. The turn
-- is recorded against the row and applied while drawing, by the thumbnails,
-- the preview and the PDF alike.
--
-- It also means a turn is reversible. Rotating back returns the original
-- exactly, because the original was never altered.
--
-- Everything else on the row - caption, status, the AI description, the
-- storage path - is untouched and stays attached to the same photograph.
--
-- ---------------------------------------------------------------------------
-- Why smallint, and why the constraint
-- ---------------------------------------------------------------------------
--
-- Four values will ever be stored. An enum would need a type, a name and a
-- migration to extend; a smallint with a check says the same thing in one
-- line and sorts and compares as a number, which is what the arithmetic in
-- lib/photos-rotation.ts does with it.
--
-- The constraint is not decoration. A photograph stored at 45 degrees would
-- print at an angle no layout is designed for, and the application already
-- normalises anything unexpected back to 0 - this stops the database being the
-- place a bad value comes from.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
--   alter table public.photos drop column if exists rotation;
--
-- Safe at any time. Dropping it loses the recorded turns and nothing else: no
-- file, no caption, no status and no description lives in this column, and
-- every photograph reverts to printing as it was uploaded.

alter table public.photos
  add column if not exists rotation smallint not null default 0;

alter table public.photos
  drop constraint if exists photos_rotation_quarter_turns;

alter table public.photos
  add constraint photos_rotation_quarter_turns
  check (rotation in (0, 90, 180, 270));

comment on column public.photos.rotation is
  'Quarter turns applied when drawing this photograph: 0, 90, 180 or 270 degrees clockwise. Presentation only - the stored object is never re-encoded, and 0 means as uploaded.';
