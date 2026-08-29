import { NextResponse } from "next/server";

import { requireSessionContext } from "@/lib/auth/session";
import { storedPdf } from "@/lib/pdf/download";
import { issuedPdfFileName } from "@/lib/pdf/presentation";
import { reportNumberLabel } from "@/lib/pdf/report-data";
import { createClient } from "@/lib/supabase/server";

/**
 * The issued PDF itself, from our own origin, so it can be shared.
 *
 * The share sheet needs a File, and a File needs bytes the browser is allowed
 * to read: a signed Supabase URL is on another origin and is not reliably
 * fetchable from a page. This route hands over exactly the stored object -
 * downloaded, not re-rendered. An issued report is the record, and a share
 * that produced a freshly rendered file would quietly create a second version
 * of a document somebody has already been sent.
 *
 * A draft has no issued PDF and gets a 404 rather than a render: there is
 * nothing here to share yet.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await requireSessionContext();
  const supabase = await createClient();

  // RLS confines this to the caller's own company, so another company's report
  // is simply not found.
  const { data: report } = await supabase
    .from("reports")
    .select("id, report_number, report_date, pdf_path")
    .eq("id", id)
    .maybeSingle();

  if (!report?.pdf_path) return new NextResponse("Not found", { status: 404 });

  const file = await storedPdf(supabase, report.pdf_path);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${issuedPdfFileName(
        "Daily Report",
        reportNumberLabel(report.report_number),
        report.report_date,
      )}"`,
      // The issued file never changes, but it is private: cached by the
      // browser that asked for it and by nothing in between.
      "cache-control": "private, max-age=300",
    },
  });
}
