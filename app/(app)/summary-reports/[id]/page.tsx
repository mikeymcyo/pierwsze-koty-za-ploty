import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { saveSummaryReportDocuments } from "@/app/(app)/documents/actions";
import { applySummaryReview, reviewSummaryReportAction } from "@/app/(app)/reports/review-actions";
import { SummaryCuration, type CuratedIssueChoice, type CuratedPhotoChoice } from "@/components/summary-reports/summary-curation";
import { SummaryDetails } from "@/components/summary-reports/summary-details";
import { SummaryDraft } from "@/components/summary-reports/summary-draft";
import { DocumentPicker, type PickableDocument } from "@/components/documents/document-picker";
import { MasterReviewPanel } from "@/components/reports/master-review";
import { DocumentUpload } from "@/components/documents/document-upload";
import { SummaryFinalise } from "@/components/summary-reports/summary-finalise";
import { DeleteSummaryReport } from "@/components/summary-reports/summary-lifecycle";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { hasAiConfig } from "@/lib/ai/report-generation";
import { documentTypeLabel } from "@/lib/documents/metadata";
import { signDocumentUrls } from "@/lib/documents/signing";
import { isReopened } from "@/lib/reports/lifecycle";
import { requireSessionContext } from "@/lib/auth/session";
import { signPhotoUrls } from "@/lib/photos-signing";
import { SUMMARY_KIND_LABELS, SUMMARY_SECTION_LABELS } from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Consolidated report" };

export default async function SummaryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSessionContext();
  const supabase = await createClient();
  const { data: report, error } = await withClockSkewRetry(() =>
    supabase
      .from("summary_reports")
      .select("*, projects(id, name, client)")
      .eq("id", id)
      .maybeSingle(),
  );
  if (error) return <LoadError what="this report" code={error.code} />;
  if (!report) notFound();

  const [sectionsResult, sourcesResult, photoLinksResult, issueLinksResult, photosResult, issuesResult] =
    await Promise.all([
      withClockSkewRetry(() =>
        supabase.from("summary_report_sections").select("id, section_type, content, ai_generated, sort_order").eq("summary_report_id", id).order("sort_order", { ascending: true }),
      ),
      withClockSkewRetry(() =>
        supabase.from("summary_report_sources").select("report_id, source_summary_report_id, via_summary_report_id, sort_order").eq("summary_report_id", id).order("sort_order", { ascending: true }),
      ),
      withClockSkewRetry(() =>
        supabase.from("summary_report_photos").select("photo_id, caption_override").eq("summary_report_id", id),
      ),
      withClockSkewRetry(() =>
        supabase.from("summary_report_issues").select("issue_id").eq("summary_report_id", id),
      ),
      withClockSkewRetry(() =>
        supabase.from("photos").select("id, caption, category, storage_path").eq("project_id", report.project_id).order("created_at", { ascending: true }),
      ),
      withClockSkewRetry(() =>
        supabase.from("issues").select("id, title, priority, status, resolution").eq("project_id", report.project_id).order("created_at", { ascending: true }),
      ),
    ]);
  const loadError = sectionsResult.error ?? sourcesResult.error ?? photoLinksResult.error ?? issueLinksResult.error ?? photosResult.error ?? issuesResult.error;

  const sources = sourcesResult.data ?? [];
  const dailyIds = sources.flatMap((source) => (source.report_id ? [source.report_id] : []));
  const progressIds = Array.from(
    new Set(
      sources.flatMap((source) =>
        [source.source_summary_report_id, source.via_summary_report_id].filter(Boolean) as string[],
      ),
    ),
  );
  const [{ data: dailyRows }, { data: progressRows }] = await Promise.all([
    dailyIds.length
      ? supabase.from("reports").select("id, report_number, report_date").in("id", dailyIds)
      : Promise.resolve({ data: [] as { id: string; report_number: number; report_date: string }[] }),
    progressIds.length
      ? supabase.from("summary_reports").select("id, number, period_start, period_end").in("id", progressIds)
      : Promise.resolve({ data: [] as { id: string; number: number; period_start: string | null; period_end: string | null }[] }),
  ]);
  const dailyById = new Map((dailyRows ?? []).map((row) => [row.id, row]));
  const progressById = new Map((progressRows ?? []).map((row) => [row.id, row]));
  const sourceItems = sources.flatMap((source) => {
    if (source.source_summary_report_id) {
      const progress = progressById.get(source.source_summary_report_id);
      return progress
        ? [{
            label: `Progress Report ${formatReportNumber(progress.number)}`,
            href: `/summary-reports/${source.source_summary_report_id}`,
          }]
        : [];
    }
    if (source.report_id) {
      const daily = dailyById.get(source.report_id);
      if (!daily) return [];
      return [{
        label: `Daily Report ${formatReportNumber(daily.report_number)} · ${formatDate(daily.report_date)}${source.via_summary_report_id ? " · provenance beneath a Progress Report" : ""}`,
        href: `/reports/${source.report_id}`,
      }];
    }
    return [];
  });

  const selectedPhotoIds = new Set((photoLinksResult.data ?? []).map((row) => row.photo_id));
  const captionByPhotoId = new Map(
    (photoLinksResult.data ?? []).map((row) => [row.photo_id, row.caption_override]),
  );
  const selectedIssueIds = new Set((issueLinksResult.data ?? []).map((row) => row.issue_id));
  const photoRows = photosResult.data ?? [];
  const photoUrls = await signPhotoUrls(photoRows.map((photo) => photo.storage_path));
  const photos: CuratedPhotoChoice[] = photoRows.map((photo) => ({
    id: photo.id,
    caption: photo.caption,
    category: photo.category,
    url: photoUrls.get(photo.storage_path) ?? null,
    selected: selectedPhotoIds.has(photo.id),
    captionOverride: captionByPhotoId.get(photo.id) ?? null,
  }));
  const issues: CuratedIssueChoice[] = (issuesResult.data ?? []).map((issue) => ({
    ...issue,
    selected: selectedIssueIds.has(issue.id),
  }));

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;
  const isFinal = report.status === "final";
  const reopened = isReopened({ status: report.status, pdfPath: report.pdf_path });

  // Kept out of loadError: with the documents migration not yet applied this
  // section is simply absent rather than an error over a working report.
  const [{ data: projectDocuments }, { data: documentLinks }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, doc_type, reference, revision, storage_path")
      .eq("project_id", report.project_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("summary_report_documents")
      .select("document_id")
      .eq("summary_report_id", id),
  ]);
  const linkedIds = new Set((documentLinks ?? []).map((row) => row.document_id));
  const documentUrls = await signDocumentUrls(
    (projectDocuments ?? []).map((row) => row.storage_path),
  );
  const pickableDocuments: PickableDocument[] = (projectDocuments ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    docType: row.doc_type,
    reference: row.reference,
    revision: row.revision,
    url: documentUrls.get(row.storage_path) ?? null,
    selected: linkedIds.has(row.id),
  }));
  const referencedDocuments = pickableDocuments.filter((row) => row.selected);
  const label = SUMMARY_KIND_LABELS[report.kind];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
        <Link href={`/projects/${report.project_id}?tab=reports`}><ArrowLeft aria-hidden />{project?.name ?? "Back to project"}</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
            {report.title || `${label} ${formatReportNumber(report.number)}`}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {[project?.name, report.period_start && report.period_end ? `${formatDate(report.period_start)} to ${formatDate(report.period_end)}` : "Whole project"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Badge tone={isFinal ? "success" : "neutral"}>{isFinal ? "Final" : reopened ? "Reopened" : "Draft"}</Badge>
      </header>

      {isFinal ? <Alert tone="info">This document has been issued and is no longer editable.</Alert> : null}
      {loadError ? <LoadError what="this report's contents" code={loadError.code} /> : null}

      {!loadError && !isFinal ? (
        <SummaryDetails reportId={id} title={report.title} />
      ) : null}

      {!loadError ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">Source evidence</h2>
          <Card><CardContent>
            <ul className="flex flex-col gap-2 text-sm text-ink-muted">
              {sourceItems.map((source, index) => (
                <li key={`${source.href}-${index}`}>
                  <Link href={source.href} className="font-medium text-ink underline underline-offset-4">
                    {source.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent></Card>
        </section>
      ) : null}

      {!loadError && !isFinal ? (
        <SummaryCuration reportId={id} photos={photos} issues={issues} />
      ) : null}

      {!loadError ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
            Supporting documents
          </h2>
          {isFinal ? (
            referencedDocuments.length === 0 ? (
              <p className="text-sm text-ink-muted">No documents were referenced.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {referencedDocuments.map((document) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{document.title}</span>
                      <span className="mt-1 block text-xs text-ink-muted">
                        {[
                          documentTypeLabel(document.docType),
                          document.reference ? `Ref ${document.reference}` : null,
                          document.revision ? `Rev ${document.revision}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {document.url ? (
                      <Button asChild variant="secondary">
                        <a href={document.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink aria-hidden />
                          Open document
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-subtle">
                        No longer stored on the project.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <DocumentUpload
                companyId={session.companyId}
                projectId={report.project_id}
                summaryReportId={id}
                label="Upload and attach a PDF"
              />
              <DocumentPicker
                action={saveSummaryReportDocuments.bind(null, id)}
                documents={pickableDocuments}
              />
            </>
          )}
        </section>
      ) : null}

      {!loadError && !isFinal ? (
        <SummaryDraft reportId={id} sections={sectionsResult.data ?? []} configured={hasAiConfig()} />
      ) : null}

      {!loadError && isFinal ? (
        <section className="flex flex-col gap-5">
          {(sectionsResult.data ?? []).filter((section) => section.content?.trim()).map((section) => (
            <div key={section.id}>
              <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">{SUMMARY_SECTION_LABELS[section.section_type]}</h2>
              <p className="mt-2 whitespace-pre-wrap text-ink">{section.content}</p>
            </div>
          ))}
        </section>
      ) : null}

      {!loadError && !isFinal ? (
        <MasterReviewPanel
          reviewAction={reviewSummaryReportAction.bind(null, id)}
          applyAction={applySummaryReview.bind(null, id)}
          configured={hasAiConfig()}
        />
      ) : null}

      {!loadError ? (
        <SummaryFinalise
          reportId={id}
          status={report.status}
          hasPdf={Boolean(report.pdf_path)}
          documentCount={referencedDocuments.length}
          finalisedAt={formatDate(report.finalised_at)}
        />
      ) : null}

      <div className="border-t border-line pt-6">
        <DeleteSummaryReport reportId={id} status={report.status} label={label} />
      </div>
    </div>
  );
}
