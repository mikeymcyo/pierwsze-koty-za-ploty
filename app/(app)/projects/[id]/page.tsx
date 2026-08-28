import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Camera, FileText, Pencil, Plus } from "lucide-react";

import { startReport } from "@/app/(app)/reports/actions";
import { IssueList } from "@/components/issues/issue-list";
import { RaiseIssue, type PhotoChoice } from "@/components/issues/raise-issue";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { PhotoGrid, type PhotoWithUrl } from "@/components/reports/photo-grid";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { isProjectTab, type ProjectTab } from "@/lib/project-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { requireSessionContext } from "@/lib/auth/session";
import { PHOTO_CATEGORY_LABELS } from "@/lib/photos";
import { signPhotoUrls } from "@/lib/photos-signing";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Project" };

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
  searchParams: Promise<{ tab?: string; closed?: string }>;
}) {
  const [{ id }, { tab, closed }] = await Promise.all([params, searchParams]);
  const showClosed = closed === "1";
  const session = await requireSessionContext();
  const supabase = await createClient();

  const activeTab: ProjectTab = isProjectTab(tab) ? tab : "overview";

  const { data: project, error } = await withClockSkewRetry(() =>
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
  );

  // A failed lookup leaves nothing to render a project page from, but that is
  // still no reason to blank the screen - the shell and navigation stay, and the
  // panel carries a code. See LoadError.
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/projects"
          className="text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          All projects
        </Link>
        <LoadError what="this project" code={error.code} />
      </div>
    );
  }

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
        .select("id, caption, category, storage_path, width, height, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ),
    withClockSkewRetry(() => {
      const query = supabase
        .from("issues")
        .select("id, title, description, responsible, priority, status, created_at")
        .eq("project_id", project.id);

      // The tab is called Open Issues and the count in it means outstanding
      // work, so closed ones are out of the way by default - but reachable,
      // because an issue nobody can look at again is a record nobody trusts.
      return (showClosed ? query : query.neq("status", "closed")).order("created_at", {
        ascending: false,
      });
    }),
  ]);

  const loadError = reportsResult.error ?? photosResult.error ?? issuesResult.error;

  const reports = reportsResult.data ?? [];
  const issues = issuesResult.data ?? [];

  const photoRows = photosResult.data ?? [];
  const photoUrls = await signPhotoUrls(photoRows.map((photo) => photo.storage_path));
  const photos: PhotoWithUrl[] = photoRows.map((photo) => ({
    ...photo,
    url: photoUrls.get(photo.storage_path) ?? null,
  }));

  const photoChoices: PhotoChoice[] = photoRows.map((photo) => ({
    id: photo.id,
    label: photo.caption
      ? `${photo.caption} (${PHOTO_CATEGORY_LABELS[photo.category]})`
      : `${PHOTO_CATEGORY_LABELS[photo.category]} - ${formatDate(photo.created_at)}`,
  }));

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

        <div className="flex flex-wrap gap-3">
          {/* Posts rather than links: starting a report inserts a row and lets
              the database assign its number, which a GET must not do. */}
          <form action={startReport}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button type="submit">
              <Plus aria-hidden />
              New report
            </Button>
          </form>
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

      {loadError ? <LoadError what="this project's data" code={loadError.code} /> : null}

      {!loadError && activeTab === "overview" ? (
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

      {!loadError && activeTab === "reports" ? (
        reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Start one with the New report button above - it fills in the date, your name and the report number for you."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id}>
                <Card className="transition-colors hover:border-line-strong">
                  <Link
                    href={`/reports/${report.id}`}
                    className="flex items-center justify-between gap-4 p-5"
                  >
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
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {!loadError && activeTab === "photos" ? (
        <section className="flex flex-col gap-5">
          {/*
            reportId is null here: these belong to the project rather than to
            any one day's report. The photos table allows it - report_id is
            nullable by design - and its RLS is company-scoped, so a project
            photo is protected exactly as a report photo is.
          */}
          <PhotoUpload companyId={session.companyId} projectId={project.id} reportId={null} />

          {photos.length === 0 ? (
            <EmptyState
              icon={Camera}
              title="No photos yet"
              description="Add them here for the project as a whole, or take them against a report - both collect on this tab."
            />
          ) : (
            <PhotoGrid photos={photos} />
          )}
        </section>
      ) : null}

      {!loadError && activeTab === "issues" ? (
        <section className="flex flex-col gap-5">
          {/* reportId is null: an issue can be raised against the project on its
              own, and issues.report_id is nullable for exactly that. */}
          <RaiseIssue projectId={project.id} reportId={null} photos={photoChoices} />

          {issues.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title={showClosed ? "No issues on this project" : "No open issues"}
              description="Raise one here, or from the report you are writing on site."
            />
          ) : (
            <IssueList issues={issues} />
          )}

          <Link
            href={`/projects/${project.id}?tab=issues${showClosed ? "" : "&closed=1"}`}
            className="self-start text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {showClosed ? "Hide closed issues" : "Show closed issues too"}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
