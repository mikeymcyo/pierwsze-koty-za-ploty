"use server";

import { revalidatePath } from "next/cache";

import { requireSessionContext } from "@/lib/auth/session";
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
} from "@/lib/issues/metadata";
import { renderReportPdf } from "@/lib/pdf/render";
import { PDF_BUCKET } from "@/lib/pdf/signing";
import {
  issuesForReport,
  orderedSections,
  photosWithData,
  reportNumberLabel,
} from "@/lib/pdf/report-data";
import { REPORT_SECTION_LABELS, REPORT_SECTION_ORDER } from "@/lib/report-sections";
import { canFinalise, pdfFileName } from "@/lib/reports/finalisation";
import { canReopen } from "@/lib/reports/lifecycle";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export type FinaliseState = { error?: string; finalised?: boolean };

/**
 * Issues the report: renders the PDF, stores it, and closes the report.
 *
 * The snapshot model is the point. While a report is a draft everything about
 * it is editable; finalising turns it into the issued record, and from then on
 * the stored PDF is what the client was sent.
 *
 * A correction goes through reopenReport, which returns the report to draft
 * while leaving the issued PDF in place and current. Issuing again renders a
 * fresh file under a new name - the timestamp in the name means it never
 * collides with, or overwrites, the file already in the bucket.
 *
 * The PDF goes to the private report-pdfs bucket under
 * {company_id}/{project_id}/, the same path shape and the same storage
 * policies as photos, and is served by a short-lived signed URL.
 */
export async function finaliseReport(
  reportId: string,
  _prev: FinaliseState,
  _formData: FormData,
): Promise<FinaliseState> {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("reports")
    .select(
      "id, project_id, report_number, report_date, weather, raw_notes, author_name, status, pdf_path, projects(name, client, site_address, project_reference)",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { error: `Could not read the report: ${error.message}` };
  if (!report) return { error: "That report could not be found." };

  const [{ data: sections }, { data: workforce }, { data: plant }, { data: photos }, { data: issues }] =
    await Promise.all([
      supabase
        .from("report_sections")
        .select("section_type, content")
        .eq("report_id", reportId),
      supabase
        .from("workforce_entries")
        .select("company_name, trade, operatives")
        .eq("report_id", reportId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("plant_entries")
        .select("description, quantity")
        .eq("report_id", reportId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("photos")
        .select("id, caption, category, storage_path")
        .eq("report_id", reportId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("issues")
        .select("id, title, description, responsible, priority, status")
        .eq("report_id", reportId),
    ]);

  const printable = orderedSections(
    sections ?? [],
    REPORT_SECTION_ORDER,
    REPORT_SECTION_LABELS,
  );

  const check = canFinalise({
    status: report.status,
    rawNotes: report.raw_notes,
    sectionCount: printable.length,
  });
  if (!check.ok) return { error: check.message };

  // Photo bytes are pulled here rather than fetched by the renderer: a signed
  // URL can expire mid-render, and an issued record must not depend on the
  // network holding up at the moment somebody presses the button. A photo that
  // cannot be read is left out rather than printed as a broken box.
  const photoRows = photos ?? [];
  const downloaded = new Map<string, Buffer>();
  for (const photo of photoRows) {
    const { data: file } = await supabase.storage
      .from("site-photos")
      .download(photo.storage_path);
    if (file) downloaded.set(photo.storage_path, Buffer.from(await file.arrayBuffer()));
  }

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const finalisedAt = new Date();

  let pdf: Buffer;
  try {
    pdf = await renderReportPdf({
      companyName: session.companyName,
      projectName: project?.name ?? "Project",
      client: project?.client ?? null,
      siteAddress: project?.site_address ?? null,
      projectReference: project?.project_reference ?? null,
      reportNumber: reportNumberLabel(report.report_number),
      reportDate: formatDate(report.report_date) ?? report.report_date,
      weather: report.weather,
      authorName: report.author_name,
      finalisedAt: formatDate(finalisedAt.toISOString().slice(0, 10)) ?? "",
      workforce: workforce ?? [],
      plant: plant ?? [],
      sections: printable,
      issues: issuesForReport(issues ?? [], ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS),
      photos: photosWithData(photoRows, downloaded),
    });
  } catch (cause) {
    console.error("[siteboss] PDF render failed:", cause);
    return { error: "The report could not be turned into a PDF. Nothing has been finalised." };
  }

  const path = `${session.companyId}/${report.project_id}/${pdfFileName(
    report.report_number,
    finalisedAt,
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return { error: `The PDF could not be stored: ${uploadError.message}` };
  }

  // Written last, and guarded on the report still being a draft: two taps in
  // quick succession must not both mark it final and leave an orphan PDF as
  // the issued record.
  const { data: updated, error: writeError } = await supabase
    .from("reports")
    .update({
      status: "final",
      finalised_at: finalisedAt.toISOString(),
      pdf_path: path,
    })
    .eq("id", reportId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (writeError) return { error: `Could not finalise the report: ${writeError.message}` };

  if (!updated) {
    // Somebody else finalised it in between. Their PDF is the issued record;
    // this one is removed rather than left in the bucket pointing at nothing.
    await supabase.storage.from(PDF_BUCKET).remove([path]);
    return { error: "This report was finalised already. Its existing PDF is the issued record." };
  }

  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/projects/${report.project_id}`);
  return { finalised: true };
}

/**
 * Reopens an issued report so a correction can be made.
 *
 * The stored PDF and the finalised date are deliberately left alone. Until the
 * report is issued again that file is still the document the client holds, so
 * abandoning an edit leaves the record exactly as it was. Finalising again
 * renders a fresh PDF under a new name and points the report at it; the
 * previous file stays in the bucket rather than being overwritten.
 */
export async function reopenReport(
  reportId: string,
  _prev: FinaliseState,
  _formData: FormData,
): Promise<FinaliseState> {
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, project_id, status, pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: `Could not read the report: ${error.message}` };
  if (!report) return { error: "That report could not be found." };

  const check = canReopen({ status: report.status, pdfPath: report.pdf_path });
  if (!check.ok) return { error: check.message };

  const { data: updated, error: writeError } = await supabase
    .from("reports")
    .update({ status: "draft" })
    .eq("id", reportId)
    .eq("status", "final")
    .select("id")
    .maybeSingle();
  if (writeError) return { error: `Could not reopen the report: ${writeError.message}` };
  if (!updated) return { error: "This report is no longer issued, so there was nothing to reopen." };

  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/projects/${report.project_id}`);
  revalidatePath("/reports");
  return { finalised: false };
}
