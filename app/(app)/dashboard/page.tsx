import { Suspense } from "react";
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

import { FieldCapture } from "@/components/reports/field-capture";
import { CaptureInProgress } from "@/components/reports/capture-in-progress";
import { FirstReportGuide } from "@/components/reports/first-report-guide";
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
import { placeOfProject } from "@/lib/projects/place";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { SUMMARY_KIND_LABELS } from "@/lib/summary-reports/sections";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();

  // Start independent reads together. Only site and draft data gate the capture shortcut.
  const recentReports = loadRecentReports(supabase);
  const issues = loadIssues(supabase);
  const [session, projectsResult, draftsResult] = await Promise.all([
    requireSessionContext(),
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
        .select("id, project_id, report_number, report_date, updated_at, raw_notes, projects(name)")
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(3),
    ),
  ]);
  const projects = projectsResult.data ?? [];
  const drafts = draftsResult.data ?? [];

  // Preserve the existing draft selection and direct capture links.
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

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const greeting = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-sm text-ink-muted">Welcome back</p>
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight text-ink md:text-4xl">
          {displayName(session)}
        </h1>
      </div>
      <p className="pb-1 text-xs font-medium tabular-nums text-ink-muted">
        {todayLabel}
        {/* The mobile top bar already carries the company name. */}
        <span className="hidden md:inline"> · {session.companyName}</span>
      </p>
    </header>
  );

  // A failed projects read must not look like an empty account.
  if (projectsResult.error) {
    return (
      <div className="flex flex-col gap-8">
        {greeting}
        <LoadError what="your dashboard" code={projectsResult.error.code} />
      </div>
    );
  }

  const otherDrafts = drafts.filter((draft) => draft.id !== inProgress?.id);
  const activeSite = projects.find((project) => project.id === inProgress?.projectId) ?? projects[0];

  return (
    <div className="flex flex-col gap-6">
      {greeting}

      {!activeSite && <FirstReportGuide hasActiveSite={false} />}

      {activeSite ? (
        <Link href={`/projects/${activeSite.id}`} className="midnight-site group relative flex min-h-36 items-center gap-4 overflow-hidden rounded-card p-5">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold tracking-wide text-info">
              {activeSite.id === inProgress?.projectId ? "Current capture site" : "Latest active site"}
            </p>
            <h2 className="text-xl leading-snug font-semibold tracking-tight text-ink">{activeSite.name}</h2>
            {activeSite.site_address || activeSite.client ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{activeSite.site_address || activeSite.client}</p>
            ) : null}
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-ink">Open site <ChevronRight className="size-4" aria-hidden /></span>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-info/20 bg-info/10 text-info"><HardHat className="size-7" strokeWidth={1.5} aria-hidden /></span>
        </Link>
      ) : null}

      {/* Keep all shortcuts on existing, working routes. */}
      <nav aria-label="Dashboard actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {inProgress || activeSite ? (
          <FieldCapture key={session.userId + ":" + session.companyId}
            userId={session.userId} companyId={session.companyId} dashboard
            projectId={inProgress?.projectId ?? activeSite!.id}
            projectName={inProgress?.projectName ?? activeSite!.name}
            reportId={inProgress?.reportDate === workingDay() ? inProgress.id : undefined} />
        ) : (
          <QuickAction href="/reports/new" icon={<Mic aria-hidden />} label="Capture" detail="Choose a site" primary />
        )}
        <QuickAction href="/reports" icon={<FileText aria-hidden />} label="Reports" detail="Drafts & issued reports" />
        <QuickAction href="/projects" icon={<FolderKanban aria-hidden />} label="Sites" detail="Your active projects" />
        <QuickAction href="#dashboard-issues" icon={<AlertTriangle aria-hidden />} label="Issues" detail="Needs attention" />
      </nav>

      {inProgress ? <CaptureInProgress draft={inProgress} /> : null}

      {activeSite && <FirstReportGuide hasActiveSite />}

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

      <section id="dashboard-issues" className="flex scroll-mt-24 flex-col gap-3">
        <Suspense fallback={<p role="status" className="text-sm text-ink-muted">Loading outstanding issues…</p>}>
          <DashboardIssues result={issues} />
        </Suspense>
      </section>

      <div className="flex flex-wrap gap-2">

        <Button asChild variant="ghost" size="sm"><Link href="/stores"><Store aria-hidden />Store locator</Link></Button>
      </div>

      {projects.length > 0 && (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <SectionHeading count={projects.length}>Active projects</SectionHeading>
            <Button asChild variant="ghost" size="sm">
              <Link href="/projects/new">
                <Plus aria-hidden />
                New project
              </Link>
            </Button>
        </div>

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
      </section>
      )}

      <Suspense fallback={<p role="status" className="text-sm text-ink-muted">Loading recent reports…</p>}>
        <RecentReports result={recentReports} />
      </Suspense>
    </div>
  );
}

type DashboardClient = Awaited<ReturnType<typeof createClient>>;

function loadIssues(supabase: DashboardClient) {
  return withClockSkewRetry(() =>
    supabase
      .from("issues")
      .select("id, title, priority, status, project_id, projects(name)")
      .neq("status", "closed")
      .in("priority", ["critical", "high"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(4),
  );
}

async function DashboardIssues({ result }: { result: ReturnType<typeof loadIssues> }) {
  const issuesResult = await result;
  const openIssues = issuesResult.data ?? [];
  return (
    <>
      {issuesResult.error ? <LoadError what="outstanding issues" code={issuesResult.error.code} /> : openIssues.length > 0 ? (
        <>
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
        </>
      ) : <div className="midnight-panel flex items-center gap-3 rounded-card p-4"><FileCheck2 className="size-5 shrink-0 text-success" aria-hidden /><p className="text-sm text-ink-muted">No high-priority issues requiring attention.</p></div>}
    </>
  );
}

function loadRecentReports(supabase: DashboardClient) {
  return Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("reports")
        .select("id, report_number, report_date, status, projects(name, site_address, postcode, location_directory, location_code)")
        .order("report_date", { ascending: false })
        .order("report_number", { ascending: false })
        .limit(5),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("summary_reports")
        .select("id, kind, number, title, period_start, period_end, status, created_at, projects(name, site_address, postcode, location_directory, location_code)")
        .order("created_at", { ascending: false })
        .limit(5),
    ),
  ]);
}

async function RecentReports({ result }: { result: ReturnType<typeof loadRecentReports> }) {
  const [daily, summaries] = await result;
  const error = daily.error ?? summaries.error;
  if (error) return <LoadError what="recent reports" code={error.code} />;
  const reports = daily.data ?? [];
  const summaryReports = summaries.data ?? [];
  return (
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
                      {placeOfProject(project) ? (
                        <p className="truncate text-xs text-ink-subtle">{placeOfProject(project)}</p>
                      ) : null}
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
                      {placeOfProject(project) ? (
                        <p className="truncate text-xs text-ink-subtle">{placeOfProject(project)}</p>
                      ) : null}
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

/** A thumb-sized shortcut using the shared Midnight Glass surfaces. */
function QuickAction({
  href,
  icon,
  label,
  detail,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "midnight-action flex min-h-32 flex-col items-start justify-center gap-3 rounded-card p-4 text-brand-ink transition-colors hover:bg-surface-raised [&_svg]:size-6"
          : "midnight-panel flex min-h-32 flex-col items-start justify-center gap-3 rounded-card p-4 text-info transition-colors hover:bg-surface-raised [&_svg]:size-6"
      }
    >
      {icon}
      <span><span className="block text-base font-semibold text-ink">{label}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">{detail}</span></span>
    </Link>
  );
}
