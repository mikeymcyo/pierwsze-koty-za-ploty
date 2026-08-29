"use server";

import { revalidatePath } from "next/cache";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { renderSummaryReportPdf } from "@/lib/pdf/summary-render";
import { PDF_BUCKET } from "@/lib/pdf/signing";
import { canReopen, nextRevision } from "@/lib/reports/lifecycle";
import { canFinaliseSummary, summaryPdfFileName } from "@/lib/summary-reports/finalisation";
import { loadSummaryPdfData } from "@/lib/summary-reports/pdf-data";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export type SummaryFinaliseState = { error?: string; finalised?: boolean };

export async function finaliseSummaryReport(
  reportId: string,
  _previous: SummaryFinaliseState,
  _formData: FormData,
): Promise<SummaryFinaliseState> {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("id, project_id, kind, number, revision, status, pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return { error: "That report could not be found." };
  if (report.status === "final") {
    return { error: "This report has already been finalised. Its stored PDF is the issued record." };
  }

  // Capture issue state immediately before rendering. The issue can continue
  // moving tomorrow; the issued report must keep saying how it stood today.
  const { data: selectedIssues } = await supabase
    .from("summary_report_issues")
    .select("id, issue_id")
    .eq("summary_report_id", reportId);
  const issueIds = (selectedIssues ?? []).map((row) => row.issue_id);
  if (issueIds.length > 0) {
    const { data: liveIssues } = await supabase
      .from("issues")
      .select("id, status, resolution")
      .in("id", issueIds);
    const liveById = new Map((liveIssues ?? []).map((issue) => [issue.id, issue]));
    for (const selected of selectedIssues ?? []) {
      const live = liveById.get(selected.issue_id);
      if (!live) continue;
      const { error } = await supabase
        .from("summary_report_issues")
        .update({ status_at_issue: live.status, resolution_at_issue: live.resolution })
        .eq("id", selected.id);
      if (error) return { error: `Could not capture the issue record: ${error.message}` };
    }
  }

  const finalisedAt = new Date();
  const loaded = await loadSummaryPdfData(supabase, reportId, {
    companyName: session.companyName,
    issuedBy: displayName(session),
    issuedAt: formatDate(finalisedAt) ?? finalisedAt.toISOString().slice(0, 10),
  });
  if (!loaded.ok) return { error: loaded.error };
  const check = canFinaliseSummary({
    status: loaded.report.status,
    sourceCount: loaded.sourceCount,
    sectionCount: loaded.sectionCount,
  });
  if (!check.ok) return { error: check.message };

  let pdf: Buffer;
  try {
    pdf = await renderSummaryReportPdf(loaded.data);
  } catch (cause) {
    console.error("[siteboss] summary PDF render failed:", cause);
    return { error: "The report could not be turned into a PDF. Nothing has been finalised." };
  }

  // Counted here rather than at reopen, so an abandoned edit never inflates
  // the revision. A report holding an issued PDF is being corrected.
  const revision = nextRevision({ revision: report.revision, pdfPath: report.pdf_path });
  const path = `${session.companyId}/${report.project_id}/${summaryPdfFileName(
    report.kind,
    report.number,
    revision,
    finalisedAt,
  )}`;
  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) return { error: `The PDF could not be stored: ${uploadError.message}` };

  const { data: updated, error: writeError } = await supabase
    .from("summary_reports")
    .update({ status: "final", pdf_path: path, revision, finalised_at: finalisedAt.toISOString() })
    .eq("id", reportId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (writeError) return { error: `Could not finalise the report: ${writeError.message}` };
  if (!updated) {
    await supabase.storage.from(PDF_BUCKET).remove([path]);
    return { error: "This report was finalised already. Its existing PDF is the issued record." };
  }

  revalidatePath(`/summary-reports/${reportId}`);
  revalidatePath(`/projects/${report.project_id}`);
  revalidatePath("/reports");
  return { finalised: true };
}

/**
 * Reopens an issued consolidated report so a correction can be made.
 *
 * As with a daily report, the stored PDF stays exactly where it is and remains
 * the issued document until this one is finalised again. Its sources are left
 * untouched: the Daily and Progress Reports underneath are what this document
 * was built from, and correcting the wording must not quietly rewrite the
 * evidence trail.
 */
export async function reopenSummaryReport(
  reportId: string,
  _previous: SummaryFinaliseState,
  _formData: FormData,
): Promise<SummaryFinaliseState> {
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("summary_reports")
    .select("id, project_id, status, pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: `Could not read the report: ${error.message}` };
  if (!report) return { error: "That report could not be found." };

  const check = canReopen({ status: report.status, pdfPath: report.pdf_path });
  if (!check.ok) return { error: check.message };

  const { data: updated, error: writeError } = await supabase
    .from("summary_reports")
    .update({ status: "draft" })
    .eq("id", reportId)
    .eq("status", "final")
    .select("id")
    .maybeSingle();
  if (writeError) return { error: `Could not reopen the report: ${writeError.message}` };
  if (!updated) return { error: "This report is no longer issued, so there was nothing to reopen." };

  revalidatePath(`/summary-reports/${reportId}`);
  revalidatePath(`/projects/${report.project_id}`);
  revalidatePath("/reports");
  return { finalised: false };
}
