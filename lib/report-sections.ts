/**
 * Section metadata, shared by the server that generates sections and the client
 * that edits them - so it carries no "use client" directive.
 */

import type { ReportSectionType } from "@/types/database";

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
      "Two or three sentences a client can read on their phone: what happened on site today and whether the job is on track.",
  },
  {
    type: "works_completed",
    label: "Works completed",
    brief: "What was actually finished today, by trade and location on site.",
  },
  {
    type: "works_in_progress",
    label: "Works in progress",
    brief: "What is part-done and continuing tomorrow.",
  },
  {
    type: "deliveries_plant",
    label: "Deliveries and plant",
    brief: "Materials that arrived and machinery on site, including anything that did not arrive.",
  },
  {
    type: "health_safety",
    label: "Health and safety",
    brief:
      "Briefings, inspections, incidents or near misses. Say nothing was reported rather than inventing an event.",
  },
  {
    type: "issues_constraints",
    label: "Issues and constraints",
    brief: "Anything blocking or slowing the work - access, weather, information, other trades.",
  },
  {
    type: "outstanding_items",
    label: "Outstanding items",
    brief: "Items awaiting a decision, an instruction or another party.",
  },
  {
    type: "planned_works",
    label: "Planned works",
    brief: "What is planned for the next working day.",
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
