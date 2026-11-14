-- The site survey: a report about a place before anybody has worked on it.
--
-- A survey is a visit made to investigate, measure and photograph so the works
-- can be priced. No works have started, so workforce, plant, deliveries and
-- "works completed" are not merely empty on a survey - they are the wrong
-- questions, and a document that asks them implies work happened.
--
-- Two enum additions and nothing else. No table, no column, no constraint, no
-- policy, no index, no backfill, and no existing row changes.
--
-- ---------------------------------------------------------------------------
-- Why a survey is a summary_reports kind
-- ---------------------------------------------------------------------------
--
-- summary_reports is already the home of "a standalone document about a
-- project, issued once and then immutable". It numbers per kind
-- (unique (project_id, kind, number, revision)), carries revisions, and owns
-- its sections, curated photographs, issue record and document register, with
-- the whole draft/preview/finalise/reopen lifecycle behind it. A survey is
-- exactly that shape. The one thing it lacks is source reports, and nothing in
-- the schema requires any - that minimum is an application rule
-- (lib/summary-reports/finalisation.ts), which is where it stays.
--
-- ---------------------------------------------------------------------------
-- Why a survey still belongs to a project, and what 'survey' status is for
-- ---------------------------------------------------------------------------
--
-- The real workflow starts at a store, often before any project exists: this
-- may only be an enquiry. But photographs and documents are the substance of a
-- survey, and both photos.project_id and documents.project_id are NOT NULL
-- with composite foreign keys, and their storage objects live under
-- {company_id}/{project_id}/ where the bucket policies match on that leading
-- folder. A project-less survey would therefore need its own photo table, its
-- own document table and its own storage policies - a great deal of new
-- surface for a document that will belong to a project the moment the work is
-- awarded anyway.
--
-- So starting a survey from a store creates the project in the same action,
-- and this status marks it as what it is: an enquiry, not a live job. It sorts
-- immediately after 'active', so surveys sit above on-hold and completed work
-- rather than at the bottom of the list.
--
-- That also answers "associate the survey with a project later without
-- re-entering everything": there is nothing to associate. The survey, its
-- photographs, its documents and any issues it raised are already on the
-- project. Awarding the work is a change of status.
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--
-- PostgreSQL cannot remove a value from an enum, so this is not revertible by
-- a drop. Rolling back means leaving the values in place and unused, which
-- costs nothing - an enum value no row references is inert. That is why it is
-- worth reading before it is applied rather than after.
--
-- ALTER TYPE ... ADD VALUE is transactional on PostgreSQL 12 and later as long
-- as the new value is not used in the same transaction. Nothing here uses one.

alter type public.summary_report_kind add value if not exists 'survey';

-- The written sections of a survey. Deliberately the questions somebody
-- standing on site before a job can actually answer. Defects observed are not
-- a section: they are issues, raised through the existing issue system and
-- printed in the report's issue record.
alter type public.summary_section_type add value if not exists 'survey_purpose';
alter type public.summary_section_type add value if not exists 'existing_condition';
alter type public.summary_section_type add value if not exists 'measurements';
alter type public.summary_section_type add value if not exists 'access_and_constraints';
alter type public.summary_section_type add value if not exists 'proposed_works';
alter type public.summary_section_type add value if not exists 'requirements';
alter type public.summary_section_type add value if not exists 'pricing_notes';

-- A project that exists because somebody is pricing work, not doing it.
alter type public.project_status add value if not exists 'survey' after 'active';
