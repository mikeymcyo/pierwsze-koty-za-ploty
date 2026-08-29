/**
 * Section metadata, shared by the server that generates sections and the client
 * that edits them - so it carries no "use client" directive.
 */

import type { ReportSectionType } from "@/types/database";

/**
 * Briefs are not documentation: each one becomes the `description` of that
 * property in the JSON schema sent to the model, so it sits right beside the
 * field being filled and competes with the system prompt for that field.
 *
 * They are therefore written under one rule - **silence is not evidence of
 * absence**. A brief must never ask a question the notes might not answer,
 * because a field that must be filled will be filled: asking the summary
 * "whether the job is on track" is what produced "No delay was recorded" from
 * notes that said nothing about programme at all.
 */
export const REPORT_SECTIONS: {
  type: ReportSectionType;
  label: string;
  /** Shown under the heading, and given to the model as the brief for that section. */
  brief: string;
}[] = [
  {
    type: "executive_summary",
    label: "Summary",
    brief:
      "A management overview for a client who will read nothing else: two or three sentences on what the day amounted to overall and where the work now stands. Do not list the individual activities - Works completed carries those, and a summary that lists them is a duplicate. Do not judge progress against programme and do not mention delay unless the notes record one.",
  },
  {
    type: "works_completed",
    label: "Works completed",
    brief:
      "The detailed record of what the notes say was actually done: the specific activities, with location, trade, materials, components and technical detail wherever the notes give them. Particulars, not an overview - if a sentence would sit equally well in the Summary, it belongs here and the Summary should say something broader. State completion only where the notes state it.",
  },
  {
    type: "works_in_progress",
    label: "Works in progress",
    brief: "What the notes describe as part-done and continuing.",
  },
  {
    type: "deliveries_plant",
    label: "Deliveries and plant",
    brief:
      "Deliveries and plant recorded in the notes or the structured data. Do not mention anything that did not arrive unless a non-arrival is recorded; leave this empty rather than reporting that deliveries were complete.",
  },
  {
    type: "health_safety",
    label: "Health and safety",
    brief:
      "Briefings, inspections, incidents or near misses recorded in the notes. Leave this empty if the notes do not mention safety - silence is not the same as 'nothing was reported', which is itself a claim.",
  },
  {
    type: "issues_constraints",
    label: "Issues and constraints",
    brief:
      "Anything the notes record as blocking or slowing the work - access, weather, information, other trades. Leave this empty if none is recorded rather than stating there were none.",
  },
  {
    type: "outstanding_items",
    label: "Outstanding items",
    brief:
      "Items the notes record as awaiting a decision, an instruction or another party. Leave this empty rather than stating that nothing is outstanding.",
  },
  {
    type: "planned_works",
    label: "Planned works",
    brief: "What the notes say is planned for the next working day.",
  },
];

export const REPORT_SECTION_ORDER: ReportSectionType[] = REPORT_SECTIONS.map((s) => s.type);

export const REPORT_SECTION_LABELS: Record<ReportSectionType, string> = Object.fromEntries(
  REPORT_SECTIONS.map((s) => [s.type, s.label]),
) as Record<ReportSectionType, string>;

export function sortOrderOf(type: ReportSectionType): number {
  const index = REPORT_SECTION_ORDER.indexOf(type);
  return index === -1 ? REPORT_SECTION_ORDER.length : index;
}
