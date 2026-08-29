import type { SummaryReportKind } from "@/types/database";

export const SUMMARY_REPORT_IS_FINAL =
  "This report has been finalised and cannot be changed. Its stored PDF is the issued record.";

export function canFinaliseSummary(input: {
  status: "draft" | "final";
  kind: SummaryReportKind;
  sourceCount: number;
  sectionCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.status === "final") return { ok: false, message: SUMMARY_REPORT_IS_FINAL };
  // Only a Completion Report is required to have something behind it. It is a
  // consolidation by definition - the record of a job, drawn from the reports
  // issued while the job ran - and one with no evidence at all would be a
  // claim rather than a record.
  //
  // A survey is built from a visit, and a Progress Report may be written
  // directly when the work was reported by phone or by message rather than in
  // Daily Reports. Requiring a source would make both impossible to issue.
  // Neither claims a provenance it does not have: with no sources there is no
  // source record in the PDF, and the drafting prompt is told plainly that
  // there are no daily reports. See lib/summary-reports/provenance.ts.
  //
  // Compared here rather than through isSurvey so this module keeps no runtime
  // imports and can be tested by loading it directly.
  if (input.kind === "completion" && input.sourceCount === 0) {
    return { ok: false, message: "Add at least one issued source report before finalising." };
  }
  if (input.sectionCount === 0) {
    return { ok: false, message: "Write at least one section before finalising." };
  }
  return { ok: true };
}

export function summaryPdfFileName(
  kind: SummaryReportKind,
  number: number,
  revision: number,
  finalisedAt: Date,
): string {
  const padded = String(number).padStart(3, "0");
  const revisionLabel = revision > 0 ? `-rev-${revision}` : "";
  const stamp = finalisedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${kind}-report-${padded}${revisionLabel}-${stamp}.pdf`;
}
