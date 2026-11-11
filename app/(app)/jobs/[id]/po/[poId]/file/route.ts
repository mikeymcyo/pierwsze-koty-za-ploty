import { NextResponse } from "next/server";

import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { poPdfFilename } from "@/lib/jobs/po-files";

const BUCKET = "job-pos";

/**
 * The PO's PDF, from our own origin, shown inline.
 *
 * Inline rather than a download: on the phone this is opened to scan the QR
 * code printed on it, so it has to appear on the screen in one tap. The
 * bucket is private; RLS on job_pos confines the lookup to the caller's own
 * company, and the storage policy confines the read to its folder.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> },
) {
  const { id, poId } = await params;
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("job_pos")
    .select("id, po_number, storage_path, job_id")
    .eq("company_id", session.companyId)
    .eq("id", poId)
    .eq("job_id", id)
    .maybeSingle();
  if (!po?.storage_path) return new NextResponse("Not found", { status: 404 });

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(po.storage_path);
  if (error || !blob) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(await blob.arrayBuffer()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${poPdfFilename(po.po_number)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
