import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  FileCheck2,
  FilePen,
  FileText,
  FolderKanban,
  HardHat,
  MapPin,
  Mic,
  Plus,
  Store,
} from "lucide-react";

import { CaptureInProgress } from "@/components/reports/capture-in-progress";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { captureCount } from "@/lib/reports/capture-log";
import { captureInProgress, type DraftDaily } from "@/lib/reports/continuity";
import { workingDay } from "@/lib/reports/working-day";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { displayName, requireSessionContext } from "@/lib/auth/session";
import { ISSUE_PRIORITY_LABELS, ISSUE_PRIORITY_TONES } from "@/lib/issues/metadata";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSessionContext();
  const supabase = await createClient();

  const [projectsResult, reportsResult, summaryReportsResult, draftsResult, issuesResult] =
    await Promise.all([
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
    // What somebody started and did not finish. This is the first thing they
    // want on a Monday morning and the thing that is otherwise three taps and
    // a guess away.
    withClockSkewRetry(() =>
      supabase
        .from("reports")
        .select("id, project_id, report_number, report_date, updated_at, raw_notes, projects(name)")
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(3),
    ),
    // What is still outstanding, worst first.
    withClockSkewRetry(() =>
      supabase
        .from("issues")
        .select("id, title, priority, status, project_id, projects(name)")
        .neq("status", "closed")
        .in("priority", ["critical", "high"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(4),
    ),
  ]);

  const loadError = projectsResult.error ?? reportsResult.error ?? summaryReportsResult.error;

  const projects = projectsResult.data ?? [];
  const reports = reportsResult.data ?? [];
  const summaryReports = summaryReportsResult.data ?? [];
  // Both are additions to the page rather than the page itself: if either
  // query fails the section is simply not shown, which is honest, instead of
  // taking the dashboard down with it.
  const drafts = draftsResult.data ?? [];

  /**
   * The Daily somebody is part-way through, lifted above the quick actions.
   *
   * It used to sit below them, linking at the report rather than at the
   * microphone, saying nothing about how much had been captured or when. The
   * first thing a site manager opens the app for is the thing he did not
   * finish, and Site Capture is where he finishes it.
   */
  const openDrafts: DraftDaily[] = drafts.map((draft) => {
    const project = Array.isArray(draft.projects) ? draft.projects[0] : draft.projects;
    return {
      id: draft.id,
      projectId: draft.project_id,
      projectName: project?.name ?? "Unknown project",
      reportNumber: draft.report_number,
      reportDate: draft.report_date,
      updatedAt: draft.updated_at,
      captureCount: captureCount(draft.raw_notes),
    };
  });
  const inProgress = captureInProgress(openDrafts, workingDay());
  const openIssues = issuesResult.data ?? [];

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const greeting = (
    <header className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-ink-muted">
        {todayLabel}
        {/* The mobile top bar already carries the company name. */}
        <span className="hidden md:inline"> · {session.companyName}</span>
      </p>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink md:text-3xl">
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

  const otherDrafts = drafts.filter((draft) => draft.id !== inProgress?.id);

  return (
    <div className="flex flex-col gap-8">
      {greeting}

      {/* The three things somebody opens this app to do, one tap from the top
          of the screen rather than found through a menu. */}
      {/* Before the quick actions, not after them. Starting a new capture is
          one tap away below; finishing the one already open is what somebody
          opened the app for. */}
      {inProgress ? <CaptureInProgress draft={inProgress} /> : null}

      <div className="grid grid-cols-3 gap-3">
        <QuickAction href="/reports/new" icon={<Mic aria-hidden />} label="Site Capture" primary />
        <QuickAction href="/projects/new" icon={<Plus aria-hidden />} label="New project" />
        <QuickAction href="/stores" icon={<Store aria-hidden />} label="Store locator" />
      </div>

      {otherDrafts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading count={otherDrafts.length}>Finish what you started</SectionHeading>
          <ul className="flex flex-col gap-3">
            {otherDrafts.map((draft) => {
              const project = Array.isArray(draft.projects) ? draft.projects[0] : draft.projects;
              return (
                <li key={draft.id}>
                  <Card className="transition-colors duration-200 hover:bg-surface-raised">
                    <Link href={`/reports/${draft.id}`} className="flex items-center gap-4 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft ring-1 ring-brand/25">
                        <FilePen className="size-5 text-warning" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          Report {formatReportNumber(draft.report_number)}
                        </p>
                        <p className="truncate text-sm text-ink-muted">
                          {project?.name ?? "Unknown project"} · {formatDate(draft.report_date)}
                        </p>
                      </div>
                      <Badge tone="warning">Draft</Badge>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {openIssues.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading count={openIssues.length}>Needs attention</SectionHeading>
          <ul className="flex flex-col gap-3">
            {openIssues.map((issue) => {
              const project = Array.isArray(issue.projects) ? issue.projects[0] : issue.projects;
              return (
                <li key={issue.id}>
                  <Card className="transition-colors duration-200 hover:bg-surface-raised">
                    <Link href={`/issues/${issue.id}`} className="flex items-center gap-4 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-warning-soft">
                        <AlertTriangle className="size-5 text-warning" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{issue.title}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {project?.name ?? "Unknown project"}
                        </p>
                      </div>
                      <Badge tone={ISSUE_PRIORITY_TONES[issue.priority]}>
                        {ISSUE_PRIORITY_LABELS[issue.priority]}
                      </Badge>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <SectionHeading count={projects.length}>Active projects</SectionHeading>
          {projects.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
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
                <Card className="transition-colors duration-200 hover:bg-surface-raised">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-ink">{project.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-muted">
                        {project.client || project.site_address ? (
                          <MapPin className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                        ) : null}
                        <span className="truncate">
                          {[project.client, project.site_address]
                            .filter(Boolean)
                            .join(" · ") || "No client or address recorded"}
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ProjectStatusBadge status={project.status} />
                        <span className="text-xs text-ink-subtle">
                          Updated {formatDate(project.updated_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading count={reports.length + summaryReports.length}>Recent reports</SectionHeading>

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
                  <Card className="transition-colors duration-200 hover:bg-surface-raised">
                    <Link href={`/summary-reports/${report.id}`} className="flex items-center gap-4 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info-soft">
                        <FileCheck2 className="size-5 text-info" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          {report.title || `${SUMMARY_KIND_LABELS[report.kind]} ${formatReportNumber(report.number)}`}
                        </p>
                        <p className="truncate text-sm text-ink-muted">
                          {project?.name ?? "Unknown project"} · {report.period_start && report.period_end ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}` : "Whole project"}
                        </p>
                      </div>
                      <Badge tone={report.status === "final" ? "success" : "neutral"}>
                        {report.status === "final" ? "Issued" : "Draft"}
                      </Badge>
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
                  <Card className="transition-colors duration-200 hover:bg-surface-raised">
                    <Link
                      href={`/reports/${report.id}`}
                      className="flex items-center gap-4 p-4"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-muted">
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
                      <Badge tone={report.status === "final" ? "success" : "neutral"}>
                        {report.status === "final" ? "Issued" : "Draft"}
                      </Badge>
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

/** A section's name, with how many of the thing are listed under it. */
function SectionHeading({ children, count }: { children: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
      {children}
      {typeof count === "number" && count > 0 ? (
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          {count}
        </span>
      ) : null}
    </h2>
  );
}

/** One of the three things worth a tap from the top of the dashboard. */
function QuickAction({
  href,
  icon,
  label,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "flex min-h-24 flex-col items-center justify-center gap-2 rounded-card bg-primary p-3 text-center text-sm font-bold text-ink-inverse shadow-glow transition-[transform,filter] duration-200 active:scale-[0.98] [&_svg]:size-6"
          : "flex min-h-24 flex-col items-center justify-center gap-2 rounded-card bg-surface p-3 text-center text-sm font-semibold text-ink shadow-card ring-1 ring-line/70 ring-inset transition-[transform,background-color] duration-200 hover:bg-surface-raised active:scale-[0.98] [&_svg]:size-6 [&_svg]:text-brand"
      }
    >
      {icon}
      {label}
    </Link>
  );
}
