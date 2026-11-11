import { Suspense } from "react";
import { FirstReportGuide } from "@/components/reports/first-report-guide";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
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

import { captureCount } from "@/lib/reports/capture-log";
import { captureInProgress, type DraftDaily } from "@/lib/reports/continuity";
import { workingDay } from "@/lib/reports/working-day";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short",
  });
  const activeSite = projects.find((project) => project.id === inProgress?.projectId) ?? projects[0];
  const greeting = (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">Welcome back</p>
        <h1 className="mt-1 break-words text-[32px] leading-tight font-semibold tracking-tight text-ink">{displayName(session)}</h1>
      </div>
      <p className="shrink-0 pb-1 text-xs font-medium tabular-nums text-ink-muted">{todayLabel}<span className="mt-1 hidden md:block">{session.companyName}</span></p>
    </header>
  );
  const loadError = projectsResult.error;
  if (loadError) return <div className="flex flex-col gap-6">{greeting}<LoadError what="your dashboard" code={loadError.code} /></div>;

  return (
    <div className="dashboard-cockpit flex flex-col gap-6">
      {greeting}
      <section aria-label="Current work" className="cockpit-site overflow-hidden rounded-[24px]">
        {activeSite ? (
          <Link href={`/projects/${activeSite.id}`} className="group block p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-[0.12em] text-info uppercase">{activeSite.id === inProgress?.projectId ? "Current capture site" : "Latest active site"}</span>
              <span className="flex items-center gap-1.5 text-xs text-success"><span className="size-1.5 rounded-full bg-success" aria-hidden />Active</span>
            </div>
            <div className="flex items-center gap-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-3xl">{activeSite.name}</h2>
                <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-ink-muted"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{activeSite.site_address || activeSite.client || "Open site details"}</p>
              </div>
              <span className="cockpit-site-mark grid size-14 shrink-0 place-items-center rounded-2xl text-info"><HardHat className="size-8" strokeWidth={1.25} aria-hidden /></span>
            </div>
            <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-ink-muted">View site <ChevronRight className="size-3.5" aria-hidden /></span>
          </Link>
        ) : (
          <div className="p-6"><HardHat className="mb-4 size-8 text-info" aria-hidden /><h2 className="text-2xl font-semibold">Your first site starts here</h2><p className="mt-2 text-sm text-ink-muted">Keep site details, captures and reports together.</p><Button asChild className="mt-5"><Link href="/projects/new"><Plus aria-hidden />Create project</Link></Button></div>
        )}
        {inProgress ? (
          <div className="flex items-center gap-3 border-t border-line/70 bg-surface-sunken/45 px-5 py-3">
            <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <p className="min-w-0 text-xs leading-relaxed text-ink-muted"><span className="font-medium text-ink">Report {formatReportNumber(inProgress.reportNumber)}</span> · {formatDate(inProgress.reportDate)} · {inProgress.captureCount} {inProgress.captureCount === 1 ? "note" : "notes"} captured{activeSite?.id !== inProgress.projectId ? ` · ${inProgress.projectName}` : ""}</p>
          </div>
        ) : null}
      </section>

      <FirstReportGuide hasActiveSite={Boolean(activeSite)} />

      <nav aria-label="Dashboard actions" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <QuickAction href={inProgress ? `/reports/${inProgress.id}/capture` : "/reports/new"} icon={<Mic aria-hidden />} label={inProgress ? "Continue capture" : "Capture"} detail="Photos & voice notes" primary />
        <QuickAction href="/jobs" icon={<ClipboardList aria-hidden />} label="Open Jobs" detail="Visits, directions & POs" />
        {inProgress && <QuickAction href="/reports/new" icon={<Plus aria-hidden />} label="Start another capture" detail="New daily report" />}
        <QuickAction href="/reports" icon={<FileText aria-hidden />} label="Reports" detail="Drafts & issued" />
        <QuickAction href="/projects" icon={<FolderKanban aria-hidden />} label="Sites" detail="Your projects" />
        <QuickAction href="#dashboard-issues" icon={<AlertTriangle aria-hidden />} label="Issues" detail="Needs attention" />
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="min-w-0">
          <SectionHeading href="/reports">Work in progress</SectionHeading>
          <div className="cockpit-list overflow-hidden rounded-2xl">
            {drafts.length ? <ul className="divide-y divide-line/60">{drafts.map((draft) => {
              const project = Array.isArray(draft.projects) ? draft.projects[0] : draft.projects;
              return <li key={draft.id}><WorkRow href={`/reports/${draft.id}`} icon={<FilePen aria-hidden />} title={`Report ${formatReportNumber(draft.report_number)}`} subtitle={`${project?.name ?? "Unknown project"} · ${formatDate(draft.report_date)}`} status={<Badge tone="warning">Draft</Badge>} /></li>;
            })}</ul> : <p className="p-5 text-sm text-ink-muted">No drafts to finish. Start a capture when you’re ready.</p>}
          </div>
        </section>
        <Suspense fallback={<p role="status">Loading outstanding issues…</p>}><DashboardIssues result={issues} /></Suspense>
      </div>

      <section>
        <SectionHeading href="/projects">Active sites</SectionHeading>
        <div className="cockpit-list overflow-hidden rounded-2xl">
          {projects.length ? <ul className="divide-y divide-line/60">{projects.map((project) => <li key={project.id}><WorkRow href={`/projects/${project.id}`} icon={<HardHat aria-hidden />} title={project.name} subtitle={project.site_address || project.client || "No address recorded"} status={<ChevronRight className="size-4 text-ink-subtle" aria-hidden />} /></li>)}</ul> : <p className="p-5 text-sm text-ink-muted">No active sites yet.</p>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2"><Button asChild variant="ghost" size="sm"><Link href="/projects/new"><Plus aria-hidden />New project</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/stores"><Store aria-hidden />Store locator</Link></Button></div>
      </section>

      <Suspense fallback={<p role="status">Loading recent reports…</p>}><RecentReports result={recentReports} /></Suspense>
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
        <section id="dashboard-issues" className="min-w-0 scroll-mt-24">
          <SectionHeading>Needs attention</SectionHeading>
          {issuesResult.error ? <LoadError what="outstanding issues" code={issuesResult.error.code} /> : <div className="cockpit-list overflow-hidden rounded-2xl">{openIssues.length ? <ul className="divide-y divide-line/60">{openIssues.map((issue) => {
            const project = Array.isArray(issue.projects) ? issue.projects[0] : issue.projects;
            return <li key={issue.id}><WorkRow href={`/issues/${issue.id}`} icon={<AlertTriangle aria-hidden />} title={issue.title} subtitle={project?.name ?? "Unknown project"} status={<Badge tone={ISSUE_PRIORITY_TONES[issue.priority]}>{ISSUE_PRIORITY_LABELS[issue.priority]}</Badge>} /></li>;
          })}</ul> : <div className="flex items-start gap-3 p-5"><FileCheck2 className="size-5 shrink-0 text-success" aria-hidden /><p className="text-sm text-ink-muted">No high-priority issues requiring attention.</p></div>}</div>}
        </section>
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
      <section>
        <SectionHeading href="/reports">Recent reports</SectionHeading>
        <div className="cockpit-list overflow-hidden rounded-2xl">
          {reports.length || summaryReports.length ? <ul className="divide-y divide-line/60">
            {summaryReports.map((report) => {
              const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
              return <li key={report.id}><WorkRow href={`/summary-reports/${report.id}`} icon={<FileCheck2 aria-hidden />} title={report.title || `${SUMMARY_KIND_LABELS[report.kind]} ${formatReportNumber(report.number)}`} subtitle={[project?.name, placeOfProject(project), report.period_start && report.period_end ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}` : "Whole project"].filter(Boolean).join(" · ")} status={<Badge tone={report.status === "final" ? "success" : "neutral"}>{report.status === "final" ? "Issued" : "Draft"}</Badge>} /></li>;
            })}
            {reports.map((report) => {
              const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
              return <li key={report.id}><WorkRow href={`/reports/${report.id}`} icon={<FileText aria-hidden />} title={`Report ${formatReportNumber(report.report_number)}`} subtitle={[project?.name, placeOfProject(project), formatDate(report.report_date)].filter(Boolean).join(" · ")} status={<Badge tone={report.status === "final" ? "success" : "neutral"}>{report.status === "final" ? "Issued" : "Draft"}</Badge>} /></li>;
            })}
          </ul> : <p className="p-5 text-sm text-ink-muted">Your reports will appear here once you start a capture.</p>}
        </div>
      </section>
  );
}

function SectionHeading({ children, href }: { children: string; href?: string }) {
  return <div className="mb-3 flex min-h-8 items-center justify-between gap-3"><h2 className="text-base font-semibold tracking-tight text-ink">{children}</h2>{href ? <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-info">View all <ChevronRight className="size-3" aria-hidden /></Link> : null}</div>;
}

function WorkRow({ href, icon, title, subtitle, status }: { href: string; icon: React.ReactNode; title: string; subtitle: string; status: React.ReactNode }) {
  return <Link href={href} className="flex min-h-20 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/50"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info [&_svg]:size-5">{icon}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{title}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{subtitle}</p></div><span className="shrink-0">{status}</span></Link>;
}

function QuickAction({ href, icon, label, detail, primary }: { href: string; icon: React.ReactNode; label: string; detail: string; primary?: boolean }) {
  return <Link href={href} className={primary ? "cockpit-capture flex min-h-28 flex-col justify-between gap-3 rounded-2xl p-4 text-ink-inverse" : "cockpit-action flex min-h-28 flex-col justify-between gap-3 rounded-2xl p-4 text-ink"}><span className="flex items-center justify-between [&>svg]:size-6">{icon}<ChevronRight className="size-4! opacity-60" aria-hidden /></span><span><span className="block text-sm font-semibold">{label}</span><span className={primary ? "mt-0.5 block text-xs opacity-80" : "mt-0.5 block text-xs text-ink-muted"}>{detail}</span></span></Link>;
}
