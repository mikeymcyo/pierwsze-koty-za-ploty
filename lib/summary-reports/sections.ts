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
    brief: "A concise overview of the work evidenced during this reporting period.",
  },
  {
    type: "key_activities",
    label: "Key activities",
    brief: "The principal activities recorded across the source reports, without duplication.",
  },
  {
    type: "works_completed",
    label: "Works completed",
    brief: "Work the source reports explicitly record as completed during the period.",
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
    brief: "Issues evidenced during the period, their recorded status and any recorded resolution.",
  },
  {
    type: "next_period",
    label: "Next period",
    brief: "Only work explicitly recorded as planned beyond the reporting period.",
  },
];

export const COMPLETION_SECTIONS: SummarySectionDefinition[] = [
  {
    type: "project_overview",
    label: "Project overview",
    brief: "A factual overview of the project and the work evidenced by the source records.",
  },
  {
    type: "scope_of_works",
    label: "Scope of works",
    brief: "The scope actually evidenced in the source records; do not infer contractual scope.",
  },
  {
    type: "stages_of_works",
    label: "Stages of works",
    brief: "The evidenced sequence of major work stages, ordered chronologically.",
  },
  {
    type: "key_technical_activities",
    label: "Key technical activities",
    brief: "Material technical activities explicitly recorded in the evidence.",
  },
  {
    type: "completed_works",
    label: "Completed works",
    brief: "Work the evidence explicitly records as complete; do not certify quality or compliance.",
  },
  {
    type: "issues_and_resolutions",
    label: "Issues and resolutions",
    brief: "Issues raised during the project, their recorded outcome and any recorded resolution.",
  },
  {
    type: "photographic_record",
    label: "Photographic record",
    brief: "A short introduction to the curated photographs, without inventing what they prove.",
  },
  {
    type: "sign_off",
    label: "Sign-off",
    brief: "Only sign-off, handover or acceptance facts explicitly present in the source records.",
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
