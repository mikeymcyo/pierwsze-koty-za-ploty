import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { saveReport, type ReportFormState } from "@/app/(app)/reports/actions";
import { IssueList } from "@/components/issues/issue-list";
import { RaiseIssue, type PhotoChoice } from "@/components/issues/raise-issue";
import { FinaliseReport } from "@/components/reports/finalise-report";
import { DeleteReport } from "@/components/reports/report-lifecycle";
import { PhotoGrid, type PhotoWithUrl } from "@/components/reports/photo-grid";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { ReportCaptureForm } from "@/components/reports/report-capture-form";
import { ReportDraft } from "@/components/reports/report-draft";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { hasAiConfig } from "@/lib/ai/report-generation";
import { requireSessionContext } from "@/lib/auth/session";
import { isReopened } from "@/lib/reports/lifecycle";
import { PHOTO_CATEGORY_LABELS } from "@/lib/photos";
import { signPhotoUrls } from "@/lib/photos-signing";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Report" };

export default async function ReportCapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);

  const session = await requireSessionContext();
  const supabase = await createClient();

  // RLS scopes this to the caller's company, so an id from another company is
  // indistinguishable from one that does not exist - which is what we want.
  const { data: report, error } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("*, projects(id, name)")
      .eq("id", id)
      .maybeSingle(),
  );

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/reports">
            <ArrowLeft aria-hidden />
            All reports
          </Link>
        </Button>
        <LoadError what="this report" code={error.code} />
      </div>
    );
  }

  if (!report) notFound();

  const [workforceResult, plantResult, photosResult, sectionsResult, issuesResult] =
    await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("workforce_entries")
        .select("*")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("plant_entries")
        .select("*")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("photos")
        .select("id, caption, category, storage_path, width, height")
        .eq("report_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("report_sections")
        .select("id, section_type, content, ai_generated")
        .eq("report_id", id)
        .order("sort_order", { ascending: true }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("issues")
        .select("id, title, description, resolution, responsible, priority, status, created_at")
        .eq("report_id", id)
        .order("created_at", { ascending: false }),
    ),
  ]);

  const photoRows = photosResult.data ?? [];
  const photoUrls = await signPhotoUrls(photoRows.map((photo) => photo.storage_path));
  const photos: PhotoWithUrl[] = photoRows.map((photo) => ({
    ...photo,
    url: photoUrls.get(photo.storage_path) ?? null,
  }));

  // The report itself loaded, so the screen is still usable. Rather than blank
  // it, the capture form is withheld - editing rows we failed to read would
  // silently wipe them on save - and the panel explains why.
  const loadError =
    workforceResult.error ??
    plantResult.error ??
    photosResult.error ??
    sectionsResult.error ??
    issuesResult.error;

  const isFinal = report.status === "final";
  const reopened = isReopened({ status: report.status, pdfPath: report.pdf_path });

  const photoChoices: PhotoChoice[] = photoRows.map((photo) => ({
    id: photo.id,
    label: photo.caption
      ? `${photo.caption} (${PHOTO_CATEGORY_LABELS[photo.category]})`
      : PHOTO_CATEGORY_LABELS[photo.category],
  }));

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const projectHref = project ? `/projects/${project.id}` : "/reports";

  const save = saveReport.bind(null, id) as (
    state: ReportFormState,
    formData: FormData,
  ) => Promise<ReportFormState>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={projectHref}>
            <ArrowLeft aria-hidden />
            {project?.name ?? "Back"}
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Report {formatReportNumber(report.report_number)}
          </h1>
          <p className="text-sm text-ink-muted">
            {[project?.name, formatDate(report.report_date), report.author_name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge tone={report.status === "final" ? "success" : "neutral"}>
          {report.status === "final" ? "Final" : reopened ? "Reopened" : "Draft"}
        </Badge>
      </header>

      {isFinal ? (
        <Alert tone="info">
          This report was issued{report.finalised_at ? ` on ${formatDate(report.finalised_at)}` : ""}.
          It is a record of what was reported that day and is no longer edited. The
          PDF below is the document that went out.
        </Alert>
      ) : null}

      {loadError ? (
        <LoadError what="this report's workforce and plant" code={loadError.code} />
      ) : isFinal ? null : (
        <ReportCaptureForm
          action={save}
          report={report}
          workforce={workforceResult.data ?? []}
          plant={plantResult.data ?? []}
          cancelHref={projectHref}
          saved={saved === "1"}
        />
      )}

      {loadError ? null : (
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
              Photos
            </h2>
            <p className="text-sm text-ink-muted">
              {isFinal
                ? "The photographs as they were issued with this report."
                : "Shoot straight from the site. They are resized on your phone before upload, so this works on a bad signal."}
            </p>
          </div>

          {isFinal ? null : (
            <PhotoUpload
              companyId={session.companyId}
              projectId={project?.id ?? report.project_id}
              reportId={report.id}
            />
          )}

          {photos.length > 0 ? <PhotoGrid photos={photos} deletable={!isFinal} /> : null}
        </section>
      )}

      {loadError ? null : (
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
              Issues
            </h2>
            <p className="text-sm text-ink-muted">
              {isFinal
                ? "Raised on this report. They stay open on the project until they are dealt with."
                : "Raise it while you are stood in front of it. It stays on the project after this report is filed."}
            </p>
          </div>

          {/* Issues outlive the report they were raised in, so a finalised
              report still lists them - but it takes no new ones. */}
          {isFinal ? null : (
            <RaiseIssue
              projectId={project?.id ?? report.project_id}
              reportId={report.id}
              photos={photoChoices}
            />
          )}

          {issuesResult.data && issuesResult.data.length > 0 ? (
            <IssueList issues={issuesResult.data} />
          ) : null}
        </section>
      )}

      {loadError || isFinal ? null : (
        <ReportDraft
          reportId={report.id}
          sections={sectionsResult.data ?? []}
          rawNotes={report.raw_notes}
          configured={hasAiConfig()}
        />
      )}

      {loadError ? null : (
        <FinaliseReport
          reportId={report.id}
          status={report.status}
          hasPdf={Boolean(report.pdf_path)}
          finalisedAt={report.finalised_at ? formatDate(report.finalised_at) : null}
        />
      )}

      <div className="border-t border-line pt-6">
        <DeleteReport reportId={report.id} status={report.status} />
      </div>
    </div>
  );
}
