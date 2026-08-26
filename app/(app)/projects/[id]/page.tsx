import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Camera, FileText, Pencil } from "lucide-react";

import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { isProjectTab, type ProjectTab } from "@/lib/project-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";
import type { IssuePriority } from "@/types/database";

export const metadata: Metadata = { title: "Project" };

const PRIORITY_TONES: Record<IssuePriority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-medium text-ink sm:text-right">{value || "—"}</dd>
    </div>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  await requireSessionContext();
  const supabase = await createClient();

  const activeTab: ProjectTab = isProjectTab(tab) ? tab : "overview";

  const { data: project, error } = await withClockSkewRetry(() =>
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
  );

  if (error) throw new Error(`Could not load the project: ${error.message}`);
  // RLS hides another company's project, so this covers "missing" and "not
  // yours" identically, without revealing which.
  if (!project) notFound();

  const [reportsResult, photosResult, issuesResult] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("reports")
        .select("id, report_number, report_date, status")
        .eq("project_id", project.id)
        .order("report_number", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("photos")
        .select("id, caption, category, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("issues")
        .select("id, title, responsible, priority, status")
        .eq("project_id", project.id)
        .neq("status", "closed")
        .order("created_at", { ascending: false }),
    ),
  ]);

  const loadError = reportsResult.error ?? photosResult.error ?? issuesResult.error;
  if (loadError) {
    throw new Error(`Could not load this project's data: ${loadError.message}`);
  }

  const reports = reportsResult.data ?? [];
  const photos = photosResult.data ?? [];
  const issues = issuesResult.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/projects"
          className="text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          All projects
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-balance text-ink md:text-3xl">
              {project.name}
            </h1>
            <p className="mt-1 text-ink-muted">
              {[project.client, project.site_address].filter(Boolean).join(" · ") ||
                "No client or address recorded"}
            </p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>

        {/* A "New report" action belongs here, but the capture screen is built
            in phase three - no button until it goes somewhere real. */}
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={`/projects/${project.id}/edit`}>
              <Pencil aria-hidden />
              Edit project
            </Link>
          </Button>
        </div>
      </header>

      <Suspense fallback={<div className="h-12 border-b border-line" />}>
        <ProjectTabs
          active={activeTab}
          counts={{ reports: reports.length, photos: photos.length, issues: issues.length }}
        />
      </Suspense>

      {activeTab === "overview" ? (
        <Card>
          <CardContent>
            <dl className="flex flex-col">
              <DetailRow label="Client" value={project.client} />
              <DetailRow label="Site address" value={project.site_address} />
              <DetailRow label="Postcode" value={project.postcode} />
              <DetailRow label="Project reference" value={project.project_reference} />
              <DetailRow label="Site manager" value={project.site_manager} />
              <DetailRow label="Start date" value={formatDate(project.start_date)} />
              <DetailRow
                label="Expected completion"
                value={formatDate(project.expected_completion_date)}
              />
            </dl>

            {project.description ? (
              <div className="mt-5 border-t border-line pt-5">
                <h2 className="text-sm font-semibold text-ink-muted">Description</h2>
                <p className="mt-2 whitespace-pre-wrap text-ink">{project.description}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "reports" ? (
        reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Report capture — photos, dictation and AI drafting — arrives in the next phase."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        Report {formatReportNumber(report.report_number)}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {formatDate(report.report_date)}
                      </p>
                    </div>
                    <Badge tone={report.status === "final" ? "success" : "neutral"}>
                      {report.status === "final" ? "Final" : "Draft"}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {activeTab === "photos" ? (
        photos.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="No photos yet"
            description="Photos taken against this project's reports will collect here. Camera capture arrives in phase four."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <Card>
                  <CardContent className="p-3">
                    <p className="truncate text-sm font-medium text-ink">
                      {photo.caption || "Untitled"}
                    </p>
                    <p className="mt-1 text-xs text-ink-subtle">{photo.category}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {activeTab === "issues" ? (
        issues.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No open issues"
            description="Outstanding items raised on site will appear here. Issue tracking arrives in phase six."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Card>
                  <CardContent className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{issue.title}</p>
                      {issue.responsible ? (
                        <p className="text-sm text-ink-muted">{issue.responsible}</p>
                      ) : null}
                    </div>
                    <Badge tone={PRIORITY_TONES[issue.priority]}>{issue.priority}</Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
