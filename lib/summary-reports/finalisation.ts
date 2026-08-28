import type { SummaryReportKind } from "@/types/database";

export const SUMMARY_REPORT_IS_FINAL =
  "This report has been finalised and cannot be changed. Its stored PDF is the issued record.";

export function canFinaliseSummary(input: {
  status: "draft" | "final";
  sourceCount: number;
  sectionCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (input.status === "final") return { ok: false, message: SUMMARY_REPORT_IS_FINAL };
  if (input.sourceCount === 0) {
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
