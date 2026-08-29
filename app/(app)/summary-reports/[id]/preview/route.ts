import { NextResponse } from "next/server";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { loadDocumentAttachments } from "@/lib/pdf/document-attachments";
import { mergeReportWithDocuments } from "@/lib/pdf/merge";
import { renderSummaryReportPdf } from "@/lib/pdf/summary-render";
import { loadSummaryPdfData } from "@/lib/summary-reports/pdf-data";
import { shouldIncludeDocuments } from "@/lib/reports/document-package";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSessionContext();
  const supabase = await createClient();
  const loaded = await loadSummaryPdfData(supabase, id, {
    companyName: session.companyName,
    issuedBy: displayName(session),
    issuedAt: "DRAFT - not issued",
  });
  if (!loaded.ok) return new NextResponse("Not found", { status: 404 });
  if (loaded.report.status === "final") {
    return NextResponse.json(
      { error: "This report is final. Open its issued PDF instead." },
      { status: 409 },
    );
  }

  try {
    let pdf = await renderSummaryReportPdf(loaded.data);

    // The preview is the package the client would receive, appendices and all.
    if (
      shouldIncludeDocuments(
        new URL(request.url).searchParams.get("documents"),
        loaded.data.supportingDocuments.length > 0,
      )
    ) {
      const attachments = await loadDocumentAttachments(supabase, {
        table: "summary_report_documents",
        column: "summary_report_id",
        id,
      });
      if (!attachments.ok) return new NextResponse(attachments.error, { status: 409 });
      const merged = await mergeReportWithDocuments(pdf, attachments.attachments);
      if (!merged.ok) return new NextResponse(merged.error, { status: 409 });
      pdf = merged.pdf;
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${loaded.data.kind}-report-${loaded.data.number}-draft.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (cause) {
    console.error("[siteboss] summary preview failed:", cause);
    return new NextResponse("The draft PDF could not be rendered.", { status: 500 });
  }
}
