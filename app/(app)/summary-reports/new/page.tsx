import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { SummaryCreateForm } from "@/components/summary-reports/summary-create-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import type { SelectableDaily } from "@/lib/summary-reports/daily-selection";
import type { SelectableProgress } from "@/lib/summary-reports/progress-selection";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import type { SummaryReportKind } from "@/types/database";

export const metadata: Metadata = { title: "Create summary report" };

export default async function NewSummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; project?: string }>;
}) {
  const { kind, project } = await searchParams;
  // A survey is not built from issued evidence, so it has its own flow. Sending
  // somebody here with ?kind=survey would quietly start a Progress Report.
  if (kind === "survey") {
    redirect(project ? `/surveys/new?project=${project}` : "/surveys/new");
  }
  await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await withClockSkewRetry(() =>
    supabase.from("projects").select("id, name").order("updated_at", { ascending: false }),
  );
  const projects = data ?? [];
  const defaultKind: SummaryReportKind = kind === "completion" ? "completion" : "progress";

  // The issued Daily Reports of the chosen project, so a Progress Report can be
  // built from the ones somebody actually means. Loaded here rather than
  // fetched from the browser: the project select navigates, and the server that
  // already knows about RLS is the only thing that should decide what this
  // person may consolidate.
  const [dailies, progressReports] = project
    ? await Promise.all([selectableDailies(supabase, project), selectableProgress(supabase, project)])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
        <Link href="/reports"><ArrowLeft aria-hidden />All reports</Link>
      </Button>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Create consolidated report</h1>
        <p className="mt-1 text-sm text-ink-muted">Build a client document from reports that have already been checked and issued.</p>
      </header>
      {error ? (
        <LoadError what="your projects" code={error.code} />
      ) : projects.length === 0 ? (
        <EmptyState icon={FileText} title="You need a project first" description="Progress and Completion Reports always belong to a project." />
      ) : (
        <SummaryCreateForm
          projects={projects}
          defaultProjectId={project}
          defaultKind={defaultKind}
          dailies={dailies}
          progressReports={progressReports}
        />
      )}
    </div>
  );
}

/**
 * Every issued Daily Report on a project, and whether an issued Progress Report
 * already carries it.
 *
 * "Already used" is shown rather than hidden. A daily may honestly appear in
 * two Progress Reports - a fortnightly and a monthly, say - and removing it
 * from the list would leave somebody unable to build the document they meant.
 */
async function selectableDailies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<SelectableDaily[]> {
  const { data: reports } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("id, report_number, report_date, finalised_at")
      .eq("project_id", projectId)
      .eq("status", "final")
      .order("report_date", { ascending: false })
      .order("report_number", { ascending: false }),
  );
  if (!reports?.length) return [];

  // Which of them an issued Progress Report already consolidates. Two reads
  // rather than a join, because PostgREST cannot express the filter across the
  // link table and the report it points at in one.
  const { data: issuedProgress } = await supabase
    .from("summary_reports")
    .select("id, number")
    .eq("project_id", projectId)
    .eq("kind", "progress")
    .eq("status", "final");

  const numberById = new Map((issuedProgress ?? []).map((row) => [row.id, row.number]));
  const usedIn = new Map<string, number>();
  if (numberById.size > 0) {
    const { data: links } = await supabase
      .from("summary_report_sources")
      .select("summary_report_id, report_id")
      .in("summary_report_id", Array.from(numberById.keys()))
      .not("report_id", "is", null);
    for (const link of links ?? []) {
      const number = numberById.get(link.summary_report_id);
      if (!link.report_id || number === undefined) continue;
      // The earliest one that took it, so the note names where it first went.
      const existing = usedIn.get(link.report_id);
      if (existing === undefined || number < existing) usedIn.set(link.report_id, number);
    }
  }

  return reports.map((report) => ({
    id: report.id,
    number: report.report_number,
    date: report.report_date,
    issuedAt: report.finalised_at,
    usedIn: usedIn.get(report.id) ?? null,
  }));
}

/**
 * Every issued Progress Report on a project, with the days it consolidated.
 *
 * The coverage is what lets a Completion Report use a Progress Report's
 * reviewed wording and leave the days beneath it as provenance rather than
 * feeding the same fortnight to the writer twice. See
 * lib/summary-reports/progress-selection.ts.
 */
async function selectableProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<SelectableProgress[]> {
  const { data: reports } = await withClockSkewRetry(() =>
    supabase
      .from("summary_reports")
      .select("id, number, period_start, period_end, finalised_at")
      .eq("project_id", projectId)
      .eq("kind", "progress")
      .eq("status", "final")
      .order("number", { ascending: true }),
  );
  if (!reports?.length) return [];

  const { data: links } = await supabase
    .from("summary_report_sources")
    .select("summary_report_id, report_id")
    .in(
      "summary_report_id",
      reports.map((report) => report.id),
    )
    .not("report_id", "is", null)
    .order("sort_order", { ascending: true });

  const dailyIdsByReport = new Map<string, string[]>();
  for (const link of links ?? []) {
    if (!link.report_id) continue;
    const values = dailyIdsByReport.get(link.summary_report_id) ?? [];
    values.push(link.report_id);
    dailyIdsByReport.set(link.summary_report_id, values);
  }

  return reports.map((report) => ({
    id: report.id,
    number: report.number,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    issuedAt: report.finalised_at,
    dailyIds: dailyIdsByReport.get(report.id) ?? [],
  }));
}
