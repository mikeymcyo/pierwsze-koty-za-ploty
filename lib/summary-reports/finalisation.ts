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

  // No document requires a source report. A Completion Report used to: it is a
  // consolidation by intent, and one with nothing behind it looked like a
  // claim rather than a record. But a job can genuinely finish without a
  // single Daily Report having been filed - a short fit-out, a job taken over
  // part-built, work reported nightly by phone - and refusing to issue the
  // completion document for that job does not make the job less finished. It
  // just means the record of it lives in somebody's email instead.
  //
  // What made the rule unnecessary is that the absence is already stated
  // rather than hidden. A report with no sources prints no source record,
  // says on its own screen that it has no reports behind it, and hands the
  // model an instruction forbidding it to claim otherwise. So a standalone
  // Completion Report cannot pass itself off as a consolidated one, which is
  // the only thing this check was ever protecting. See
  // lib/summary-reports/provenance.ts.
  //
  // What is still required of every document is content: a report with no
  // written section would be an official-looking document that says nothing.
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
