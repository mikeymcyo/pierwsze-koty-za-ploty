import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { ReportRow } from "@/components/reports/report-row";
import { SummaryRow } from "@/components/summary-reports/summary-row";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireSessionContext();
  const supabase = await createClient();
  const [dailyResult, summaryResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase.from("reports").select("id, report_number, report_date, status, created_at, finalised_at, projects(name)").order("report_date", { ascending: false }).order("report_number", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase.from("summary_reports").select("id, kind, number, revision, title, period_start, period_end, status, created_at, finalised_at, projects(name)").order("created_at", { ascending: false }),
    ),
  ]);
  const error = dailyResult.error ?? summaryResult.error;
  const daily = dailyResult.data ?? [];
  const summaries = summaryResult.data ?? [];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Reports"
        description="Daily records, client updates, completion documents and site surveys. Swipe a report left, or use its menu, for its actions."
        icon={FileText}
        actions={
          <>
          <Button asChild variant="secondary" size="sm"><Link href="/reports/new"><Plus aria-hidden />Daily</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href="/summary-reports/new?kind=progress"><Plus aria-hidden />Progress</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href="/summary-reports/new?kind=completion"><Plus aria-hidden />Completion</Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href="/surveys/new"><Plus aria-hidden />Survey</Link></Button>
          </>
        }
      />

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
                      <SummaryRow report={{ ...report, projectName: project?.name ?? null }} />
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
                      <ReportRow report={{ ...report, projectName: project?.name ?? null }} />
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
