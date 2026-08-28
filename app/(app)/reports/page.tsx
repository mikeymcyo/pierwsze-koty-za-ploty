import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireSessionContext();
  const supabase = await createClient();
  const [dailyResult, summaryResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase.from("reports").select("id, report_number, report_date, status, projects(name)").order("report_date", { ascending: false }).order("report_number", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase.from("summary_reports").select("id, kind, number, revision, title, period_start, period_end, status, created_at, projects(name)").order("created_at", { ascending: false }),
    ),
  ]);
  const error = dailyResult.error ?? summaryResult.error;
  const daily = dailyResult.data ?? [];
  const summaries = summaryResult.data ?? [];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-ink-muted">Daily records, client progress updates and project completion documents.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm"><Link href="/reports/new"><Plus aria-hidden />Daily</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href="/summary-reports/new?kind=progress"><Plus aria-hidden />Progress</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href="/summary-reports/new?kind=completion"><Plus aria-hidden />Completion</Link></Button>
        </div>
      </header>

      {error ? (
        <LoadError what="your reports" code={error.code} />
      ) : daily.length === 0 && summaries.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" description="Start with a Daily Report on site. Progress and Completion Reports are built from issued records." />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Progress and completion</h2>
            {summaries.length === 0 ? (
              <p className="text-sm text-ink-muted">No consolidated reports yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {summaries.map((report) => {
                  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
                  return (
                    <li key={report.id}>
                      <Card className="transition-colors hover:border-line-strong">
                        <Link href={`/summary-reports/${report.id}`} className="flex items-center gap-4 p-5">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-muted"><FileCheck2 className="size-5 text-ink-muted" aria-hidden /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{report.title || `${SUMMARY_KIND_LABELS[report.kind]} ${formatReportNumber(report.number)}`}</p>
                            <p className="truncate text-sm text-ink-muted">{project?.name ?? "Unknown project"}{report.period_start && report.period_end ? ` · ${formatDate(report.period_start)} to ${formatDate(report.period_end)}` : " · Whole project"}</p>
                          </div>
                          <Badge tone={report.status === "final" ? "success" : "neutral"}>{report.status === "final" ? "Final" : "Draft"}</Badge>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Daily Reports</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-ink-muted">No Daily Reports yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {daily.map((report) => {
                  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
                  return (
                    <li key={report.id}>
                      <Card className="transition-colors hover:border-line-strong">
                        <Link href={`/reports/${report.id}`} className="flex items-center justify-between gap-4 p-5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">Daily Report {formatReportNumber(report.report_number)} · {formatDate(report.report_date)}</p>
                            <p className="truncate text-sm text-ink-muted">{project?.name ?? "Unknown project"}</p>
                          </div>
                          <Badge tone={report.status === "final" ? "success" : "neutral"}>{report.status === "final" ? "Final" : "Draft"}</Badge>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
