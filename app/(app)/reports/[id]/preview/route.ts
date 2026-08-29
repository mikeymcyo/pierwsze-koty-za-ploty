import { NextResponse } from "next/server";

import { requireSessionContext } from "@/lib/auth/session";
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from "@/lib/issues/metadata";
import { loadDocumentAttachments } from "@/lib/pdf/document-attachments";
import { mergeReportWithDocuments } from "@/lib/pdf/merge";
import { renderReportPdf } from "@/lib/pdf/render";
import {
  issuesForReport,
  orderedSections,
  photosWithData,
  reportNumberLabel,
} from "@/lib/pdf/report-data";
import { REPORT_SECTION_LABELS, REPORT_SECTION_ORDER } from "@/lib/report-sections";
import { resolveDocument } from "@/lib/documents/metadata";
import { loadReferencedDocuments } from "@/lib/documents/snapshot";
import { shouldIncludeDocuments } from "@/lib/reports/document-package";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/**
 * The draft preview: what the PDF would look like if it were issued now.
 *
 * A route handler rather than a server action, because the answer is a file
 * and not a state update. Nothing is stored and nothing about the report
 * changes - pressing this must never be mistaken for issuing it, so the
 * document is rendered fresh each time and the screen labels it a draft.
 *
 * A finalised report is served from storage instead: once issued, the stored
 * PDF is the record, and re-rendering one from today's data under an old date
 * would quietly produce a second version of a document somebody has already
 * been sent.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSessionContext();
  const supabase = await createClient();

  // RLS confines every query below to the caller's own company, so a report
  // belonging to somebody else is simply not found.
  const { data: report } = await supabase
    .from("reports")
    .select(
      "id, project_id, report_number, report_date, weather, raw_notes, author_name, status, pdf_path, projects(name, client, site_address, project_reference)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!report) return new NextResponse("Not found", { status: 404 });

  if (report.status === "final") {
    // Nothing to preview: the issued PDF is the report. The screen offers that
    // one instead, so this is only reachable by typing the URL.
    return NextResponse.json(
      { error: "This report is final. Open its issued PDF instead." },
      { status: 409 },
    );
  }

  const [{ data: sections }, { data: workforce }, { data: plant }, { data: photos }, { data: issues }] =
    await Promise.all([
      supabase.from("report_sections").select("section_type, content").eq("report_id", id),
      supabase
        .from("workforce_entries")
        .select("company_name, trade, operatives")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("plant_entries")
        .select("description, quantity")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("photos")
        .select("id, caption, category, storage_path")
        .eq("report_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("issues")
        .select("id, title, description, responsible, priority, status")
        .eq("report_id", id),
    ]);

  const photoRows = photos ?? [];
  const downloaded = new Map<string, Buffer>();
  for (const photo of photoRows) {
    const { data: file } = await supabase.storage
      .from("site-photos")
      .download(photo.storage_path);
    if (file) downloaded.set(photo.storage_path, Buffer.from(await file.arrayBuffer()));
  }

  const referenced = await loadReferencedDocuments(supabase, {
    table: "report_documents",
    column: "report_id",
    id,
  });
  const supportingDocuments = referenced.flatMap((entry) => {
    const resolved = resolveDocument(entry.snapshot, entry.live);
    return resolved
      ? [{ ...resolved, documentDate: formatDate(resolved.documentDate) ?? resolved.documentDate }]
      : [];
  });

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  let pdf = await renderReportPdf({
    companyName: session.companyName,
    projectName: project?.name ?? "Project",
    client: project?.client ?? null,
    siteAddress: project?.site_address ?? null,
    projectReference: project?.project_reference ?? null,
    reportNumber: reportNumberLabel(report.report_number),
    reportDate: formatDate(report.report_date) ?? report.report_date,
    weather: report.weather,
    authorName: report.author_name,
    finalisedAt: "DRAFT - not issued",
    workforce: workforce ?? [],
    plant: plant ?? [],
    sections: orderedSections(sections ?? [], REPORT_SECTION_ORDER, REPORT_SECTION_LABELS),
    issues: issuesForReport(issues ?? [], ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS),
    photos: photosWithData(photoRows, downloaded),
    supportingDocuments,
  });

  // The preview is the package the client would receive, appendices and all -
  // a preview that only listed the drawings would not be a preview of what is
  // about to be issued.
  const include = shouldIncludeDocuments(
    new URL(request.url).searchParams.get("documents"),
    supportingDocuments.length > 0,
  );
  if (include) {
    const loaded = await loadDocumentAttachments(supabase, {
      table: "report_documents",
      column: "report_id",
      id,
    });
    if (!loaded.ok) return new NextResponse(loaded.error, { status: 409 });
    const merged = await mergeReportWithDocuments(pdf, loaded.attachments);
    if (!merged.ok) return new NextResponse(merged.error, { status: 409 });
    pdf = merged.pdf;
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="report-${reportNumberLabel(report.report_number)}-draft.pdf"`,
      // A draft changes with every save; a cached copy would show yesterday's.
      "cache-control": "no-store",
    },
  });
}
