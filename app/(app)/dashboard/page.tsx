import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, FileText, FolderKanban, HardHat, Plus } from "lucide-react";

import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { displayName, requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const [projectsResult, reportsResult, summaryReportsResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("projects")
        .select("id, name, client, site_address, status, updated_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(5),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("reports")
        .select("id, report_number, report_date, status, projects(name)")
        .order("report_date", { ascending: false })
        .order("report_number", { ascending: false })
        .limit(5),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("summary_reports")
        .select("id, kind, number, title, period_start, period_end, status, created_at, projects(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ),
  ]);

  const loadError = projectsResult.error ?? reportsResult.error ?? summaryReportsResult.error;

  const projects = projectsResult.data ?? [];
  const reports = reportsResult.data ?? [];
  const summaryReports = summaryReportsResult.data ?? [];

  const greeting = (
    <header className="flex flex-col gap-1">
      {/* The mobile top bar already carries the company name. */}
      <p className="hidden text-sm font-semibold text-ink-muted md:block">
        {session.companyName}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
        Hello, {displayName(session)}
      </h1>
    </header>
  );

  // Shown in place rather than thrown, so the shell and navigation survive and
  // the user gets a code they can quote - see LoadError. Both sections are
  // dropped rather than left to render their empty states: with the queries
  // failed we do not know that there are no projects, and saying so would be
  // telling the user something we have not established.
  if (loadError) {
    return (
      <div className="flex flex-col gap-8">
        {greeting}
        <LoadError what="your dashboard" code={loadError.code} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {greeting}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
            Active projects
          </h2>
          {projects.length > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/projects/new">
                <Plus aria-hidden />
                New project
              </Link>
            </Button>
          ) : null}
        </div>

        {projects.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="No active projects yet"
            description="A project holds the site details, and every report and photo belongs to one. Start here."
            action={
              <Button asChild size="lg">
                <Link href="/projects/new">
                  <Plus aria-hidden />
                  Create your first project
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Card className="transition-colors hover:border-line-strong">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-start justify-between gap-4 p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{project.name}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {[project.client, project.site_address]
                          .filter(Boolean)
                          .join(" · ") || "No client or address recorded"}
                      </p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          Recent reports
        </h2>

        {reports.length === 0 && summaryReports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Once you have a project, you'll be able to add photos, dictate an update and generate a client-ready report."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {summaryReports.map((report) => {
              const project = Array.isArray(report.projects)
                ? report.projects[0]
                : report.projects;
              return (
                <li key={report.id}>
                  <Card className="transition-colors hover:border-line-strong">
                    <Link href={`/summary-reports/${report.id}`} className="flex items-center gap-4 p-5">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-muted">
                        <FileCheck2 className="size-5 text-ink-muted" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          {report.title || `${SUMMARY_KIND_LABELS[report.kind]} ${formatReportNumber(report.number)}`}
                        </p>
                        <p className="truncate text-sm text-ink-muted">
                          {project?.name ?? "Unknown project"} · {report.period_start && report.period_end ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}` : "Whole project"}
                        </p>
                      </div>
                    </Link>
                  </Card>
                </li>
              );
            })}
            {reports.map((report) => {
              const project = Array.isArray(report.projects)
                ? report.projects[0]
                : report.projects;

              return (
                <li key={report.id}>
                  <Card className="transition-colors hover:border-line-strong">
                    <Link
                      href={`/reports/${report.id}`}
                      className="flex items-center gap-4 p-5"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-muted">
                        <FolderKanban className="size-5 text-ink-muted" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          Report {formatReportNumber(report.report_number)}
                        </p>
                        <p className="truncate text-sm text-ink-muted">
                          {project?.name ?? "Unknown project"} ·{" "}
                          {formatDate(report.report_date)}
                        </p>
                      </div>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
