import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PdfViewer } from "@/components/pdf/pdf-viewer";
import { requireSessionContext } from "@/lib/auth/session";
import { issuedPdfFileName } from "@/lib/pdf/presentation";
import { coverPhotoIdOf, pdfStyleOf } from "@/lib/pdf/presentation";
import { reportNumberLabel } from "@/lib/pdf/report-data";
import { signPdfUrl } from "@/lib/pdf/signing";
import { isReopened } from "@/lib/reports/lifecycle";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Report PDF" };

export default async function ReportPdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; documents?: string; style?: string; cover?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const wantsDraft = search.draft === "1";
  // Carried through so the preview is the exact package - and the exact
  // presentation - that would be issued.
  const documentsFlag = search.documents === "0" ? "&documents=0" : "";
  const cover = coverPhotoIdOf(search.cover);
  const presentation = `&style=${pdfStyleOf(search.style)}${cover ? `&cover=${cover}` : ""}`;
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, report_number, report_date, status, pdf_path, finalised_at")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  const issued = report.status === "final";
  // A reopened report can show either: the PDF already issued - still the
  // document the client holds - or a preview of the corrections in progress.
  // Both are legitimate questions to ask, so the caller says which it wants.
  const showingIssued =
    issued || (isReopened({ status: report.status, pdfPath: report.pdf_path }) && !wantsDraft);
  const src = showingIssued
    ? await signPdfUrl(report.pdf_path)
    : `/reports/${id}/preview?draft=1${documentsFlag}${presentation}`;

  const note = issued
    ? `Issued${report.finalised_at ? ` on ${formatDate(report.finalised_at)}` : ""}. This is the stored PDF, not a new render.`
    : showingIssued
      ? "This report is open for editing. Until you finalise it again, this previously issued PDF is still the current document."
      : wantsDraft
        ? "A preview of your corrections. The PDF already issued is unchanged until you finalise again."
        : "This is a draft preview, not the issued record.";

  return (
    <PdfViewer
      src={src}
      title={`Daily Report ${reportNumberLabel(report.report_number)} · ${formatDate(report.report_date) ?? report.report_date}`}
      backHref={`/reports/${id}`}
      backLabel="Back to the report"
      note={note}
      // Only the stored file is offered for sharing, and only when one exists.
      shareHref={showingIssued && report.pdf_path ? `/reports/${id}/file` : undefined}
      shareName={issuedPdfFileName(
        "Daily Report",
        reportNumberLabel(report.report_number),
        report.report_date,
      )}
    />
  );
}
