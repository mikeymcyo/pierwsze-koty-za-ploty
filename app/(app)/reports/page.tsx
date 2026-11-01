import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { ReportRow } from "@/components/reports/report-row";
import { SummaryRow } from "@/components/summary-reports/summary-row";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { placeOfProject } from "@/lib/projects/place";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireSessionContext();
  const supabase = await createClient();
  const [dailyResult, summaryResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase.from("reports").select("id, report_number, report_date, status, created_at, finalised_at, projects(name, site_address, postcode, location_directory, location_code)").order("report_date", { ascending: false }).order("report_number", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase.from("summary_reports").select("id, kind, number, revision, title, period_start, period_end, status, created_at, finalised_at, projects(name, site_address, postcode, location_directory, location_code)").order("created_at", { ascending: false }),
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

      />



      <nav aria-label="Create a report" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/reports/new", title: "Daily", description: "Capture today’s work", primary: true },
          { href: "/summary-reports/new?kind=progress", title: "Progress", description: "Update your client" },
          { href: "/summary-reports/new?kind=completion", title: "Completion", description: "Close out the job" },
          { href: "/surveys/new", title: "Survey", description: "Record a site visit" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className={item.primary ? "cockpit-capture flex min-h-28 flex-col justify-between rounded-2xl p-4 text-ink-inverse" : "cockpit-action flex min-h-28 flex-col justify-between rounded-2xl p-4 text-ink"}>
            <Plus className="size-5" aria-hidden />
            <span><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-xs opacity-80">{item.description}</span></span>
          </Link>
        ))}
      </nav>

      {error ? (
        <LoadError what="your reports" code={error.code} />
      ) : daily.length === 0 && summaries.length === 0 ? (
        <EmptyState icon={FileText} title="No reports yet" description="Start with a Daily Report on site. Progress and Completion Reports are built from issued records." />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Progress and completion</h2>
            {summaries.length === 0 ? (
              <p className="text-sm text-ink-muted">No consolidated reports yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {summaries.map((report) => {
                  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
                  return (
                    <li key={report.id}>
                      <SummaryRow report={{ ...report, projectName: project?.name ?? null, place: placeOfProject(project) }} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Daily Reports</h2>
            {daily.length === 0 ? (
              <p className="text-sm text-ink-muted">No Daily Reports yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {daily.map((report) => {
                  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
                  return (
                    <li key={report.id}>
                      <ReportRow report={{ ...report, projectName: project?.name ?? null, place: placeOfProject(project) }} />
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
