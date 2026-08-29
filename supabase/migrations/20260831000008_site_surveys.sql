-- The site survey: a report about a place before anybody has worked on it.
--
-- A survey is a visit made to investigate, measure and photograph so the works
-- can be priced. No works have started, so workforce, plant, deliveries and
-- "works completed" are not merely empty on a survey - they are the wrong
-- questions, and a document that asks them implies work happened.
--
-- It is a third `summary_reports` kind rather than a new table. That table is
-- already the home of "a standalone document about a project, issued once and
-- then immutable": it numbers per kind, carries revisions, holds its own
-- sections, curated photographs, issue record and document register, and has
-- the whole draft/preview/finalise/reopen lifecycle behind it. A survey is
-- exactly that shape. The only thing it does not have is source reports, and
-- nothing in the schema requires any - that minimum is an application rule
-- (lib/summary-reports/finalisation.ts), which is where it stays.
--
-- So this migration adds enum values and nothing else. No table, no column, no
-- constraint, no policy, no index, no backfill. Every existing progress and
-- completion report is untouched, and no existing row changes.
--
-- The one honest caveat: PostgreSQL cannot remove a value from an enum, so
-- this is not revertible by a `drop`. Rolling it back means leaving the values
-- in place and unused, which costs nothing - an enum value no row references
-- is inert. That is why it is worth reading before it is applied rather than
-- after.
--
-- ALTER TYPE ... ADD VALUE is transactional on PostgreSQL 12 and later as long
-- as the new value is not used in the same transaction. Nothing here uses one.

alter type public.summary_report_kind add value if not exists 'survey';

-- The written sections of a survey. Deliberately the questions somebody
-- standing on site before a job can actually answer.
alter type public.summary_section_type add value if not exists 'survey_purpose';
alter type public.summary_section_type add value if not exists 'existing_condition';
alter type public.summary_section_type add value if not exists 'measurements';
alter type public.summary_section_type add value if not exists 'access_and_constraints';
alter type public.summary_section_type add value if not exists 'proposed_works';
alter type public.summary_section_type add value if not exists 'requirements';
alter type public.summary_section_type add value if not exists 'pricing_notes';
