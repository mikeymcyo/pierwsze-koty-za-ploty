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
  // A survey is built from a visit, not from issued reports. Requiring a
  // source would make it impossible to issue one, which is the whole point of
  // the document: it exists before there is anything to consolidate.
  //
  // Compared here rather than through isSurvey so this module keeps no runtime
  // imports and can be tested by loading it directly.
  if (input.kind !== "survey" && input.sourceCount === 0) {
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
