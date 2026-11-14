import { NextResponse } from "next/server";

import { requireSessionContext } from "@/lib/auth/session";
import { storedPdf } from "@/lib/pdf/download";
import { issuedPdfFileName } from "@/lib/pdf/presentation";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { formatReportNumber } from "@/lib/utils";

/**
 * The issued PDF itself, from our own origin, so it can be shared.
 * See the daily report's route for why this streams the stored file rather
 * than rendering one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("summary_reports")
    .select("id, kind, number, title, finalised_at, pdf_path")
    .eq("id", id)
    .maybeSingle();

  if (!report?.pdf_path) return new NextResponse("Not found", { status: 404 });

  const file = await storedPdf(supabase, report.pdf_path);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${issuedPdfFileName(
        SUMMARY_KIND_LABELS[report.kind],
        formatReportNumber(report.number),
        report.finalised_at,
      )}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
