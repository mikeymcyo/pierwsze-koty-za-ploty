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
      "The one account of the day, for a client who will read nothing else: what was done, where, and anything that mattered. This is the main section of a Daily Report and carries the day on its own where the notes support nothing further. Do not judge progress against programme and do not mention delay unless the notes record one.",
  },
  {
    type: "works_completed",
    label: "Works completed",
    brief:
      "Particulars the Summary does not already carry - specific activities with their location, trade, materials, components, quantities and technical detail, where the notes actually give them. LEAVE THIS EMPTY when the notes support nothing beyond what the Summary says; a day's work described twice in different words is the commonest fault in these reports, and one good Summary is better than two accounts of the same thing. State completion only where the notes state it. Looking for, sourcing, pricing, chasing or ordering something is not completed work.",
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
      "Items the notes record as awaiting a decision, an instruction, information, a delivery or another party - things the works are held up by rather than things we intend to do. Materials being sourced, priced, chased or awaited belong here, never under completed work. Where such an item is also programmed, say so here, with its timing, and do not repeat it under Planned works. Leave this empty rather than stating that nothing is outstanding.",
  },
  {
    type: "planned_works",
    label: "Planned works",
    brief:
      "Work the notes say we intend to carry out next and which is not waiting on anybody else. Anything already stated as outstanding belongs there with its timing, not here as well.",
  },
];

export const REPORT_SECTION_ORDER: ReportSectionType[] = REPORT_SECTIONS.map((s) => s.type);

export const REPORT_SECTION_LABELS: Record<ReportSectionType, string> = Object.fromEntries(
  REPORT_SECTIONS.map((s) => [s.type, s.label]),
) as Record<ReportSectionType, string>;

/**
 * The sections the AI writes on a Daily Report, which is one.
 *
 * A Daily Report is a summary and its evidence. Asking for works completed,
 * works in progress and deliveries as well produced four accounts of one day,
 * and a field that must be filled will be filled - so three of them repeated
 * the first in different words. The other stored types remain: a report
 * written before this still holds its text, and nothing deletes it.
 */
export const DAILY_DRAFTED_TYPES: readonly ReportSectionType[] = ["executive_summary"];

export const DAILY_DRAFTED_SECTIONS = REPORT_SECTIONS.filter((section) =>
  DAILY_DRAFTED_TYPES.includes(section.type),
);

export function sortOrderOf(type: ReportSectionType): number {
  const index = REPORT_SECTION_ORDER.indexOf(type);
  return index === -1 ? REPORT_SECTION_ORDER.length : index;
}
