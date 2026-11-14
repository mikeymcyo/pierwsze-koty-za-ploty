import "server-only";

import type { DependentDocument } from "@/lib/reports/lifecycle";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { formatReportNumber } from "@/lib/utils";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Which issued reports reference this document.
 *
 * Only issued ones count. A draft referencing a drawing is a working note and
 * must not stop somebody tidying up a document they uploaded by mistake; an
 * issued report naming it is a record somebody has been sent, and the drawing
 * it names has to stay openable.
 */
export async function dependentsOfDocument(
  supabase: Client,
  documentId: string,
): Promise<DependentDocument[]> {
  const [{ data: dailyLinks }, { data: summaryLinks }] = await Promise.all([
    supabase.from("report_documents").select("report_id").eq("document_id", documentId),
    supabase
      .from("summary_report_documents")
      .select("summary_report_id")
      .eq("document_id", documentId),
  ]);

  const dailyIds = (dailyLinks ?? []).map((row) => row.report_id);
  const summaryIds = (summaryLinks ?? []).map((row) => row.summary_report_id);

  const [{ data: reports }, { data: summaries }] = await Promise.all([
    dailyIds.length
      ? supabase
          .from("reports")
          .select("id, report_number, status")
          .in("id", dailyIds)
          .eq("status", "final")
      : Promise.resolve({ data: [] as { id: string; report_number: number; status: string }[] }),
    summaryIds.length
      ? supabase
          .from("summary_reports")
          .select("id, kind, number, status")
          .in("id", summaryIds)
          .eq("status", "final")
      : Promise.resolve({
          data: [] as { id: string; kind: "progress" | "completion"; number: number; status: string }[],
        }),
  ]);

  return [
    ...(reports ?? []).map((row) => ({
      id: row.id,
      label: `Daily Report ${formatReportNumber(row.report_number)}`,
    })),
    ...(summaries ?? []).map((row) => ({
      id: row.id,
      label: `${SUMMARY_KIND_LABELS[row.kind]} ${formatReportNumber(row.number)}`,
    })),
  ];
}
