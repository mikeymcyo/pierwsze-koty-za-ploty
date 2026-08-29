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
    label: "Project overview",
    brief: "Why this project or work package existed and what it amounted to overall - the context and outcome a reader needs before any detail. Not a list of workstreams (Scope of works) and not a sequence of events (Stages of works).",
  },
  {
    type: "scope_of_works",
    label: "Scope of works",
    brief: "Which workstreams and items were within the package: what was included. Not how or when any of it was carried out, and never inferred contractual scope.",
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
    brief: "What the evidence explicitly records as complete. Do not restate the scope as though all of it were delivered, and do not certify quality or compliance.",
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
    type: "sign_off",
    label: "Sign-off",
    brief: "Only sign-off, handover or acceptance facts explicitly present in the source records, together with anything recorded as genuinely outstanding or follow-on. Leave empty rather than implying acceptance.",
  },
];

export const SUMMARY_SECTION_LABELS: Record<SummarySectionType, string> = Object.fromEntries(
  [...PROGRESS_SECTIONS, ...COMPLETION_SECTIONS].map((section) => [
    section.type,
    section.label,
  ]),
) as Record<SummarySectionType, string>;

export const SUMMARY_KIND_LABELS: Record<SummaryReportKind, string> = {
  progress: "Progress Report",
  completion: "Completion Report",
};

export function summarySectionsFor(kind: SummaryReportKind): SummarySectionDefinition[] {
  return kind === "progress" ? PROGRESS_SECTIONS : COMPLETION_SECTIONS;
}

export function summarySectionOrder(kind: SummaryReportKind): SummarySectionType[] {
  return summarySectionsFor(kind).map((section) => section.type);
}

export function summarySortOrder(kind: SummaryReportKind, type: SummarySectionType): number {
  const index = summarySectionOrder(kind).indexOf(type);
  return index === -1 ? 999 : index;
}
