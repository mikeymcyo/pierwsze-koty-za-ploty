import type { SummaryReportKind, SummarySectionType } from "@/types/database";

export type SummarySectionDefinition = {
  type: SummarySectionType;
  label: string;
  brief: string;
};

export const PROGRESS_SECTIONS: SummarySectionDefinition[] = [
  {
    type: "period_summary",
    label: "Period summary",
    brief: "A management overview of the period for a client who will read nothing else: what the period amounted to and where the work now stands. Not the activity list - Key activities carries that, and repeating it here wastes the only section some readers will read.",
  },
  {
    type: "key_activities",
    label: "Key activities",
    brief: "The principal activities recorded across the source reports, with location, trade and materials where the evidence gives them. The detailed record, consolidated and stated once.",
  },
  {
    type: "works_completed",
    label: "Works completed",
    brief: "Only work the source reports explicitly record as completed during the period. Not a restatement of Key activities - an activity that was carried out is not by itself an activity that was finished.",
  },
  {
    type: "works_in_progress",
    label: "Works in progress",
    brief: "Work explicitly recorded as ongoing at the end of the period.",
  },
  {
    type: "resources_and_plant",
    label: "Resources and plant",
    brief: "Material workforce or plant information supported by the source reports.",
  },
  {
    type: "issues_and_resolutions",
    label: "Issues and resolutions",
    brief:
      "Problems and constraints actually recorded during the period, their recorded status and any recorded resolution, including any recorded health and safety matter. Leave empty rather than stating there were none.",
  },
  {
    type: "next_period",
    label: "Next period",
    brief: "Only work explicitly recorded as planned beyond the reporting period, together with anything the evidence records as genuinely outstanding or awaiting another party. Leave empty rather than stating that nothing is outstanding.",
  },
];

export const COMPLETION_SECTIONS: SummarySectionDefinition[] = [
  {
    type: "project_overview",
    label: "Completion summary",
    brief: "The executive account of the job, in four or five sentences, able to stand on its own for a client who reads nothing else: what the project was, what was achieved, and where it now stands overall. It must NOT list the completed activities - Completed works carries those and a reader will meet them there - and must not restate the workstreams or the sequence. Never repeat a sentence that appears in another section. State the overall status only as the evidence supports it: where anything is recorded as outstanding or follow-on, this section must say the main works are complete with those items remaining, never that all works are complete. Write it the way a site manager would say it out loud - \"the main reinstatement works are complete, with localised patch repairs remaining at the second manhole\" - not in legal register. Never write phrases like \"the completion position is limited to\", \"insofar as\", \"for the avoidance of doubt\" or \"the aforementioned\".",
  },
  {
    type: "scope_of_works",
    label: "Scope of works",
    brief: "The workstreams and items within the package, at the technical depth the evidence actually gives: name the elements, locations, materials and systems the records name - manholes, slabs, expansion joints, drainage, the areas and levels involved. A single generic line such as 'concrete works at the site' is a failure when the records name the components. What was included, not how or when it was carried out, and never inferred contractual scope. Do not restate this list as Completed works.",
  },
  {
    type: "stages_of_works",
    label: "Stages of works",
    brief: "How the work actually progressed, in order, stage by stage, as the evidence records it. The sequence and its milestones - not the scope list written out a second time.",
  },
  {
    type: "key_technical_activities",
    label: "Key technical activities",
    brief: "Methods, materials, systems and fixings of substance, only where the evidence explicitly names them.",
  },
  {
    type: "completed_works",
    label: "Completed works",
    brief: "The specific activities the evidence records as finished, with their locations, materials and quantities - what was actually done and to what. Nothing that is planned, programmed, awaited or still to be carried out belongs here; that is Outstanding and sign-off. Do not restate the scope as though all of it were delivered, do not repeat the completion summary, and do not certify quality or compliance. Where the job had several distinct workstreams, write them as short lines each beginning \"- \", one workstream per line, rather than one dense paragraph; a single workstream stays as prose. A blanket sentence such as 'all works were completed successfully' is not a completed activity and does not belong in this section at all.",
  },
  {
    type: "issues_and_resolutions",
    label: "Issues and resolutions",
    brief:
      "Problems and constraints actually recorded during the project, their recorded outcome and any recorded resolution, including any recorded health and safety matter. Leave empty rather than stating there were none.",
  },
  {
    type: "photographic_record",
    label: "Photographic record",
    brief: "A short introduction to the curated photographs, without inventing what they prove.",
  },
  {
    // The label carries both jobs because the section does. Naming it
    // "Sign-off" alone put outstanding works under a heading that reads as
    // though they had been signed off - the opposite of what the evidence
    // said. The stored type is unchanged; this is what a reader sees.
    type: "sign_off",
    label: "Outstanding and sign-off",
    brief:
      "Two things, in this order. First, anything the evidence records as genuinely outstanding or as follow-on work, with what it is waiting on where that is recorded. Then, only where the source records explicitly say so, any sign-off, handover or acceptance fact. Never write that the works were accepted, handed over, approved, tested, commissioned, certified or signed off unless a source record says it in those terms; leave the sentence out instead. An empty section is a correct answer.",
  },
];

/**
 * The site survey.
 *
 * A visit made before anybody has worked here, to investigate, measure and
 * photograph so the works can be priced. Nothing below asks what was
 * completed, who was on site, what was delivered or what plant was used -
 * those are the wrong questions for a survey, and a document that asks them
 * implies work happened.
 *
 * Defects observed are deliberately not a section. They are issues, raised
 * through the existing issue system so they can be tracked, closed and carried
 * into the job if the work is awarded, and printed in this report's own issue
 * record.
 */
export const SURVEY_SECTIONS: SummarySectionDefinition[] = [
  {
    type: "survey_purpose",
    label: "Purpose of visit",
    brief:
      "Why this visit was made and what was being investigated - the question the survey set out to answer. Never a statement about work carried out.",
  },
  {
    type: "existing_condition",
    label: "Findings and existing condition",
    brief:
      "What was actually found on site: the condition of what is there now, as observed. Only what was seen. Never an assessment of compliance, adequacy or cause unless the observation supports it.",
  },
  {
    type: "measurements",
    label: "Measurements",
    brief:
      "Dimensions, quantities and areas actually taken on site, with what each one refers to. Never an estimate presented as a measurement.",
  },
  {
    type: "access_and_constraints",
    label: "Access and site constraints",
    brief:
      "How the area is reached and what limits working there: access routes, restrictions, trading hours, height, storage, permits observed to be needed. Only constraints actually established on the visit.",
  },
  {
    type: "proposed_works",
    label: "Recommended works",
    brief:
      "What is proposed to put the findings right, as a recommendation. Explicitly proposed, never described as done, agreed, instructed or approved.",
  },
  {
    type: "requirements",
    label: "Materials, plant and access requirements",
    brief:
      "What carrying out the recommended works would require: materials, plant, access equipment, attendances. A requirement, never a record of anything supplied or used.",
  },
  {
    type: "pricing_notes",
    label: "Notes for pricing",
    brief:
      "What whoever prices this needs to know and could not tell from the rest: unknowns, risks, assumptions, anything that will need confirming. Leave empty rather than filling it with restated findings.",
  },
];

export const SUMMARY_SECTION_LABELS: Record<SummarySectionType, string> = Object.fromEntries(
  [...PROGRESS_SECTIONS, ...COMPLETION_SECTIONS, ...SURVEY_SECTIONS].map((section) => [
    section.type,
    section.label,
  ]),
) as Record<SummarySectionType, string>;

export const SUMMARY_KIND_LABELS: Record<SummaryReportKind, string> = {
  progress: "Progress Report",
  completion: "Completion Report",
  survey: "Site Survey",
};

/** What the issued document calls itself. */
export const SUMMARY_DOCUMENT_TITLES: Record<SummaryReportKind, string> = {
  progress: "Progress Report",
  completion: "Completion Report",
  survey: "Site Survey / Inspection Report",
};

/**
 * A survey is a visit, not a period, and it is built from nothing.
 *
 * Everything that treats a consolidated report as "a span of time consolidated
 * from issued evidence" has to ask this rather than assume it - the source
 * requirement, the period wording and the document title all turn on it.
 */
export function isSurvey(kind: SummaryReportKind): boolean {
  return kind === "survey";
}

/** How the document describes when it applies. */
export function summaryPeriodLabel(
  kind: SummaryReportKind,
  start: string | null,
  end: string | null,
  format: (value: string) => string | null = (value) => value,
): string {
  if (isSurvey(kind)) {
    // Both dates hold the visit date, so "29 August to 29 August" would be
    // nonsense. One date, named for what it is.
    const visited = start ?? end;
    return visited ? (format(visited) ?? visited) : "Date not recorded";
  }
  if (start && end) return `${format(start) ?? start} to ${format(end) ?? end}`;
  // A Completion Report with no dates is the record of the whole job, which is
  // what it is for. A Progress Report is not: it covers whatever the manager
  // wrote or whatever was issued, and claiming it covers the whole project
  // would be inventing a scope nobody entered. Neither invents a date.
  return kind === "completion" ? "Whole project record" : "Period not stated";
}

/** What the control panel calls that date. */
export function summaryPeriodFieldLabel(kind: SummaryReportKind): string {
  if (isSurvey(kind)) return "Date of visit";
  return kind === "completion" ? "Project record" : "Reporting period";
}

export function summarySectionsFor(kind: SummaryReportKind): SummarySectionDefinition[] {
  if (kind === "survey") return SURVEY_SECTIONS;
  return kind === "progress" ? PROGRESS_SECTIONS : COMPLETION_SECTIONS;
}

/**
 * The Completion Report a client actually reads.
 *
 * Three written sections: what the job was and where it stands, what was
 * completed, and what is still open. Everything else a Completion Report can
 * hold - the scope list, the stage-by-stage sequence, the key technical
 * activities, a written introduction to the plates - is left to the parts of
 * the document that already carry it: the photographs to the photographic
 * record, the issues to the issue record, the sources to the source record.
 *
 * ## Why fewer, and why not a migration
 *
 * Asked to fill eight fields from one body of evidence, a model fills all
 * eight. The issued Completion Report 003 was the proof: Project Overview,
 * Scope, Stages, Key technical activities and Completed Works were five
 * accounts of the same fortnight, each true, together a compressed database of
 * the underlying reports rather than a document anybody wants to read.
 *
 * So the model is asked for three. **No section type is removed**: every one is
 * still stored, still editable, and still printed when it carries words. A
 * Completion Report drafted before this - or one where somebody wrote a stage
 * sequence by hand because that job needed one - prints exactly as it did.
 * Nothing anybody wrote is dropped, which is why this is a change to what is
 * asked for rather than to what exists.
 */
export const COMPLETION_DRAFTED_TYPES: readonly SummarySectionType[] = [
  "project_overview",
  "completed_works",
  "sign_off",
];

/**
 * The sections the AI is asked to write, which is not the same as the sections
 * the document can hold.
 *
 * Only a Completion Report distinguishes the two today. Everything else drafts
 * what it stores.
 */
export function summaryDraftedSectionsFor(kind: SummaryReportKind): SummarySectionDefinition[] {
  if (kind !== "completion") return summarySectionsFor(kind);
  return COMPLETION_SECTIONS.filter((section) =>
    COMPLETION_DRAFTED_TYPES.includes(section.type),
  );
}

export function summarySectionOrder(kind: SummaryReportKind): SummarySectionType[] {
  return summarySectionsFor(kind).map((section) => section.type);
}

export function summarySortOrder(kind: SummaryReportKind, type: SummarySectionType): number {
  const index = summarySectionOrder(kind).indexOf(type);
  return index === -1 ? 999 : index;
}
