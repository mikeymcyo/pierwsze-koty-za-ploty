import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, Camera, ClipboardList, FileText, Mic, Pencil, Plus } from "lucide-react";

import { openSiteCapture } from "@/app/(app)/reports/capture-actions";
import { IssueList } from "@/components/issues/issue-list";
import { RaiseIssue, type PhotoChoice } from "@/components/issues/raise-issue";
import { DocumentCard, type DocumentCardData } from "@/components/documents/document-card";
import { DocumentUpload } from "@/components/documents/document-upload";
import { ProjectActivity } from "@/components/projects/project-activity";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { PhotoGrid, type PhotoWithUrl } from "@/components/reports/photo-grid";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { AwardProject } from "@/components/projects/award-project";
import { ProjectStatusBadge, isEnquiry } from "@/components/projects/status-badge";
import { ReportRow } from "@/components/reports/report-row";
import { SummaryRow } from "@/components/summary-reports/summary-row";
import { JobBrief, type BriefDocument } from "@/components/projects/job-brief";
import { LinkedStoreCard, UnknownStoreCard } from "@/components/stores/linked-store-card";
import { BackLink } from "@/components/ui/back-link";
import { isProjectTab, type ProjectTab } from "@/lib/project-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { hasAiConfig } from "@/lib/ai/report-generation";
import { requireSessionContext } from "@/lib/auth/session";
import { ISSUE_PRIORITY_LABELS } from "@/lib/issues/metadata";
import { photoPickerLabel } from "@/lib/photo-captions";
import {
  dailyActivity,
  issueActivity,
  mergeActivity,
  summaryActivity,
} from "@/lib/projects/activity";
import { signDocumentUrls } from "@/lib/documents/signing";
import { signPhotoUrls } from "@/lib/photos-signing";
import { storeFor } from "@/lib/stores/catalogue";
import { storeLinkOf } from "@/lib/stores/project-link";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { briefDocumentIds } from "@/lib/projects/job-brief";
import { formatDate } from "@/lib/utils";

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
        <BackLink href="/projects">All projects</BackLink>
        <LoadError what="this project" code={error.code} />
      </div>
    );
  }

  // RLS hides another company's project, so this covers "missing" and "not
  // yours" identically, without revealing which.
  if (!project) notFound();

  // Resolved from the directory that ships with this build, not from anything
  // stored on the project, so a corrected address reaches every project at the
  // store at once.
  const enquiry = isEnquiry(project.status);
  const storeLink = storeLinkOf(project);
  const linkedStore = storeLink ? storeFor(storeLink.directory, storeLink.code) : null;

  // The Activity tab reads issues that the Issues tab hides - closed ones,
  // and when each was closed - so it needs its own query rather than a
  // filtered view of that one. It is only run on the tab that shows it.
  const wantsActivity = activeTab === "activity";

  const [
    reportsResult,
    summaryReportsResult,
    photosResult,
    issuesResult,
    documentsResult,
    activityIssuesResult,
  ] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("reports")
        .select("id, report_number, report_date, status, created_at, finalised_at")
        .eq("project_id", project.id)
        .order("report_number", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("summary_reports")
        .select("id, kind, number, revision, title, period_start, period_end, status, created_at, finalised_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ),
    withClockSkewRetry(() =>
      supabase
        .from("photos")
        .select("id, caption, category, storage_path, width, height, rotation, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ),
    withClockSkewRetry(() => {
      const query = supabase
        .from("issues")
        .select("id, title, description, resolution, responsible, priority, status, created_at")
        .eq("project_id", project.id);

      // The tab is called Open Issues and the count in it means outstanding
      // work, so closed ones are out of the way by default - but reachable,
      // because an issue nobody can look at again is a record nobody trusts.
      return (showClosed ? query : query.neq("status", "closed")).order("created_at", {
        ascending: false,
      });
    }),
    withClockSkewRetry(() =>
      supabase
        .from("documents")
        .select(
          "id, title, original_filename, doc_type, description, reference, revision, document_date, expiry_date, file_size, storage_path",
        )
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
    ),
    wantsActivity
      ? withClockSkewRetry(() =>
          supabase
            .from("issues")
            .select("id, title, priority, status, resolution, created_at, closed_at")
            .eq("project_id", project.id)
            .order("created_at", { ascending: false }),
        )
      : Promise.resolve(null),
  ]);

  const loadError =
    reportsResult.error ?? summaryReportsResult.error ?? photosResult.error ?? issuesResult.error;

  const reports = reportsResult.data ?? [];
  const summaryReports = summaryReportsResult.data ?? [];
  const issues = issuesResult.data ?? [];

  const photoRows = photosResult.data ?? [];
  const photoUrls = await signPhotoUrls(photoRows.map((photo) => photo.storage_path));
  const photos: PhotoWithUrl[] = photoRows.map((photo) => ({
    ...photo,
    url: photoUrls.get(photo.storage_path) ?? null,
  }));

  // Deliberately kept out of loadError above. If the documents migration has
  // not been applied to this database the tab is simply empty, which is the
  // truth, rather than an error card over a project whose reports and
  // photographs are all working.
  const documentRows = documentsResult.data ?? [];
  const documentUrls = await signDocumentUrls(documentRows.map((row) => row.storage_path));
  const documents: DocumentCardData[] = documentRows.map((row) => ({
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    docType: row.doc_type,
    description: row.description,
    reference: row.reference,
    revision: row.revision,
    documentDate: formatDate(row.document_date),
    expiryDate: row.expiry_date,
    fileSize: row.file_size,
    url: documentUrls.get(row.storage_path) ?? null,
  }));

  // A document is job scope because somebody said so, never because it was
  // uploaded - so the picker shows which ones already are.
  const scopeIds = new Set(briefDocumentIds(project.description));
  const briefDocuments: BriefDocument[] = documentRows.map((row) => ({
    id: row.id,
    title: row.title,
    filename: row.original_filename,
    docType: row.doc_type,
    inScope: scopeIds.has(row.id),
  }));

  // Built from the rows already fetched above plus that one extra query, so
  // the whole history costs no more round trips than the tab it sits beside.
  // A source that failed is simply absent and named on the tab; it does not
  // take the rest of the history down with it.
  const activityItems = wantsActivity
    ? mergeActivity([
        dailyActivity(reports, formatDate),
        summaryActivity(summaryReports, formatDate),
        issueActivity(activityIssuesResult?.data ?? [], ISSUE_PRIORITY_LABELS),
      ])
    : [];

  const photoChoices: PhotoChoice[] = photoRows.map((photo) => ({
    id: photo.id,
    label: photoPickerLabel(photo, formatDate(photo.created_at) ?? "Photograph"),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <BackLink href="/projects">All projects</BackLink>

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
          {/* An enquiry has no works to report on yet, so it is offered the
              survey and nothing else. Daily, Progress and Completion Reports
              appear the moment the work is awarded. */}
          {enquiry ? null : (
            <>
              {/* The one action somebody standing on site needs. It opens
                  today's Daily Report if there is one and starts it if there is
                  not, so tapping it at eight, at half ten and at two lands on
                  the same report every time. Posts rather than links: it may
                  insert a row and let the database assign its number, which a
                  GET must not do. */}
              <form action={openSiteCapture}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit">
                  <Mic aria-hidden />
                  Site Capture
                </Button>
              </form>
              <Button asChild variant="secondary">
                <Link href={`/summary-reports/new?kind=progress&project=${project.id}`}>
                  <Plus aria-hidden />
                  Progress Report
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/summary-reports/new?kind=completion&project=${project.id}`}>
                  <Plus aria-hidden />
                  Completion Report
                </Link>
              </Button>
            </>
          )}
          <Button asChild variant={enquiry ? "primary" : "secondary"}>
            <Link href={`/surveys/new?project=${project.id}`}>
              <ClipboardList aria-hidden />
              Site survey
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/projects/${project.id}/edit`}>
              <Pencil aria-hidden />
              Edit project
            </Link>
          </Button>
        </div>
      </header>

      {enquiry ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted p-4">
          <p className="text-sm text-ink-muted">
            This is an enquiry: somebody is pricing work here, not doing it. It is kept out of
            active projects and off the dashboard until the work is awarded.
          </p>
          <AwardProject projectId={project.id} />
        </div>
      ) : null}

      <Suspense fallback={<div className="h-12 border-b border-line" />}>
        <ProjectTabs
          active={activeTab}
          counts={{
            reports: reports.length + summaryReports.length,
            photos: photos.length,
            issues: issues.length,
          }}
        />
      </Suspense>

      {loadError ? <LoadError what="this project's data" code={loadError.code} /> : null}

      {/* The place, above the paperwork about the place. Only when the project
          actually records one - a project entered by hand shows nothing here
          and is not missing anything. */}
      {!loadError && activeTab === "overview" && storeLink ? (
        linkedStore ? (
          <LinkedStoreCard store={linkedStore} />
        ) : (
          <UnknownStoreCard link={storeLink} />
        )
      ) : null}

      {/* What the job is supposed to be, before anything about what happened.
          A brief spoken in the van at seven is valid scope on its own; a
          purchase order that arrives at half past two is added to it and never
          replaces it. See lib/projects/job-brief.ts. */}
      {!loadError && activeTab === "overview" && !enquiry ? (
        <JobBrief
          projectId={project.id}
          companyId={session.companyId}
          description={project.description}
          documents={briefDocuments}
        />
      ) : null}

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
        reports.length === 0 && summaryReports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description="Start one with the New report button above - it fills in the date, your name and the report number for you."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {summaryReports.map((report) => (
              <li key={report.id}>
                <SummaryRow report={{ ...report, projectName: null }} />
              </li>
            ))}
            {reports.map((report) => (
              <li key={report.id}>
                <ReportRow report={{ ...report, projectName: null }} />
              </li>
            ))}
          </ul>
        )
      ) : null}

      {!loadError && activeTab === "documents" ? (
        <section className="flex flex-col gap-5">
          <DocumentUpload companyId={session.companyId} projectId={project.id} />

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Drawings, RAMS, specifications, permits and certificates live here, and reports reference them from the project."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {documents.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </ul>
          )}
        </section>
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
            <PhotoGrid photos={photos} aiConfigured={hasAiConfig()} />
          )}
        </section>
      ) : null}

      {!loadError && activeTab === "activity" ? (
        <ProjectActivity
          items={activityItems}
          unavailable={activityIssuesResult?.error ? "Issues" : null}
        />
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
