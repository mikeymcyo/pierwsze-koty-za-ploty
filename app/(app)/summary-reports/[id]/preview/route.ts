import { NextResponse } from "next/server";

import { displayName, requireSessionContext } from "@/lib/auth/session";
import { renderSummaryReportPdf } from "@/lib/pdf/summary-render";
import { loadSummaryPdfData } from "@/lib/summary-reports/pdf-data";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
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
    const pdf = await renderSummaryReportPdf(loaded.data);
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
