import "server-only";

import type { DependentDocument } from "@/lib/reports/lifecycle";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { formatReportNumber } from "@/lib/utils";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Which consolidated reports would be damaged by removing something.
 *
 * Deleting a Daily Report cascades its photographs away with it. If an issued
 * Progress or Completion Report cites that report - or prints one of its
 * photographs - the PDF somebody holds would end up referring to evidence that
 * no longer exists. These lookups are what let the delete actions refuse and
 * say which documents are in the way, rather than cascading quietly.
 */
async function labelsFor(supabase: Client, ids: string[]): Promise<DependentDocument[]> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];
  const { data } = await supabase
    .from("summary_reports")
    .select("id, kind, number, status")
    .in("id", unique)
    .order("number", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    label: `${SUMMARY_KIND_LABELS[row.kind]} ${formatReportNumber(row.number)}${
      row.status === "final" ? "" : " (draft)"
    }`,
  }));
}

/** Consolidated reports built on this Daily Report, or printing its photographs. */
export async function dependentsOfDailyReport(
  supabase: Client,
  reportId: string,
): Promise<DependentDocument[]> {
  const { data: photoRows } = await supabase
    .from("photos")
    .select("id")
    .eq("report_id", reportId);
  const photoIds = (photoRows ?? []).map((row) => row.id);

  const [{ data: sourceRows }, { data: photoUses }] = await Promise.all([
    supabase
      .from("summary_report_sources")
      .select("summary_report_id")
      .eq("report_id", reportId),
    photoIds.length
      ? supabase
          .from("summary_report_photos")
          .select("summary_report_id")
          .in("photo_id", photoIds)
      : Promise.resolve({ data: [] as { summary_report_id: string }[] }),
  ]);

  return labelsFor(supabase, [
    ...(sourceRows ?? []).map((row) => row.summary_report_id),
    ...(photoUses ?? []).map((row) => row.summary_report_id),
  ]);
}

/**
 * Consolidated reports built on this one - a Completion Report citing a
 * Progress Report either directly or as the route to a Daily Report beneath it.
 */
export async function dependentsOfSummaryReport(
  supabase: Client,
  reportId: string,
): Promise<DependentDocument[]> {
  const { data } = await supabase
    .from("summary_report_sources")
    .select("summary_report_id")
    .or(`source_summary_report_id.eq.${reportId},via_summary_report_id.eq.${reportId}`);
  return labelsFor(
    supabase,
    (data ?? [])
      .map((row) => row.summary_report_id)
      // Its own provenance rows are not a reason to keep it.
      .filter((id) => id !== reportId),
  );
}
