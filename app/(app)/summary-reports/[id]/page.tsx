import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Layers } from "lucide-react";

import { saveSummaryReportDocuments } from "@/app/(app)/documents/actions";
import { updateSummarySectionGroup } from "@/app/(app)/summary-reports/ai-actions";
import { applySummaryReview, reviewSummaryReportAction } from "@/app/(app)/reports/review-actions";
import { SummaryCuration, type CuratedIssueChoice, type CuratedPhotoChoice } from "@/components/summary-reports/summary-curation";
import { ReportPhotos, type ReportPhoto } from "@/components/summary-reports/report-photos";
import { SummaryDetails } from "@/components/summary-reports/summary-details";
import { SummaryWriter } from "@/components/summary-reports/summary-draft";
import { InstructedWorksPanel } from "@/components/summary-reports/instructed-works-panel";
import { parseInstructedWorks } from "@/lib/summary-reports/instructed-works";
import { GroupEditor } from "@/components/reports/group-editor";
import {
  ReadOnlySection,
  ReportSectionCard,
} from "@/components/reports/report-section-card";
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
import { issuedPdfFileName } from "@/lib/pdf/presentation";
import { photoPrintLabelText } from "@/lib/photo-captions";
import { signPhotoUrls } from "@/lib/photos-signing";
import { groupSections, reportStructure, runInLabel, type ReportGroup } from "@/lib/report-structure";
import { describeProvenance, isStandalone } from "@/lib/summary-reports/provenance";
import {
  describeSourceLine,
  type SourceCounts,
} from "@/lib/summary-reports/source-summary";
import {
  SUMMARY_KIND_LABELS,
  SUMMARY_SECTION_LABELS,
  isSurvey,
  summaryPeriodLabel,
} from "@/lib/summary-reports/sections";
import { createClient } from "@/lib/supabase/server";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { formatDate, formatReportNumber } from "@/lib/utils";
import type { SummarySectionType } from "@/types/database";

/**
 * A group's written sections on an issued document.
 *
 * Run-in labels rather than a heading each: the same device the PDF uses, so
 * the screen and the document a client received read alike. See
 * lib/report-structure.ts.
 */
function SectionProse({
  entry,
}: {
  entry: { group: ReportGroup; entries: { id: string; section_type: string; content: string | null }[] } | undefined;
}) {
  // The instructed works table is JSON, not prose. It is rendered by
  // InstructedWorksPanel below; printing it here would show a paragraph of
  // braces to the person signing the report off.
  const written = (entry?.entries ?? []).filter(
    (section) => section.content?.trim() && section.section_type !== "instructed_works",
  );
  if (!entry || written.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {written.map((section) => (
        <ReadOnlySection
          key={section.id}
          label={runInLabel(
            entry.group,
            SUMMARY_SECTION_LABELS[section.section_type as SummarySectionType],
            written.length,
          )}
          content={(section.content ?? "").trim()}
        />
      ))}
    </div>
  );
}

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
        // In the order they print. The screen shows plate references against
        // them and offers to reorder them, so it has to agree with the PDF.
        supabase.from("summary_report_photos").select("photo_id, caption_override, sort_order").eq("summary_report_id", id).order("sort_order", { ascending: true }),
      ),
      withClockSkewRetry(() =>
        supabase.from("summary_report_issues").select("issue_id").eq("summary_report_id", id),
      ),
      withClockSkewRetry(() =>
        supabase.from("photos").select("id, caption, category, storage_path, rotation").eq("project_id", report.project_id).order("created_at", { ascending: true }),
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

  /**
   * What this document was built from, as numbers rather than as a list of
   * links. One line near the top saying "Built from Daily Reports 001 and 002"
   * is what stops a source-based report reading as though the evidence had
   * vanished - see lib/summary-reports/source-summary.ts.
   *
   * A daily carrying `via` is provenance beneath a Progress Report and is
   * counted rather than named: it reached the writer through that report's
   * reviewed wording, not on its own.
   */
  const sourceCounts: SourceCounts = {
    progress: sources.flatMap((source) => {
      const progress = source.source_summary_report_id
        ? progressById.get(source.source_summary_report_id)
        : undefined;
      return progress ? [progress.number] : [];
    }),
    daily: sources.flatMap((source) => {
      if (!source.report_id || source.via_summary_report_id) return [];
      const daily = dailyById.get(source.report_id);
      return daily ? [daily.report_number] : [];
    }),
    viaDaily: sources.filter((source) => source.report_id && source.via_summary_report_id).length,
  };
  const sourceLine = describeSourceLine(sourceCounts);
  /** Whether this document consolidates anything, which decides how it reads. */
  const consolidating = sourceCounts.daily.length + sourceCounts.progress.length > 0;

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
    rotation: photo.rotation,
    url: photoUrls.get(photo.storage_path) ?? null,
    selected: selectedPhotoIds.has(photo.id),
    captionOverride: captionByPhotoId.get(photo.id) ?? null,
  }));
  const issues: CuratedIssueChoice[] = (issuesResult.data ?? []).map((issue) => ({
    ...issue,
    selected: selectedIssueIds.has(issue.id),
  }));

  // A survey works its photographs in place, in the order they will print - and
  // so does a Progress Report written directly, which is the same situation:
  // there is no earlier report to have collected them.
  const survey = isSurvey(report.kind);
  const standalone = isStandalone(sources.length);
  const direct = survey || standalone;
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  /**
   * The report's own plates, in the order they print.
   *
   * One set, not two. This is `summary_report_photos` - exactly what
   * lib/summary-reports/pdf-data.ts reads to build the document - carrying the
   * caption written for this report so the arrange view shows what will
   * actually appear under each plate. The curation form below ticks the same
   * rows; nothing else decides what is exported.
   */
  const attachedPhotos: ReportPhoto[] = (photoLinksResult.data ?? []).flatMap((link) => {
    const photo = photoById.get(link.photo_id);
    return photo
      ? [
          {
            id: photo.id,
            url: photo.url,
            caption: photo.caption,
            category: photo.category,
            rotation: photo.rotation,
            captionOverride: link.caption_override,
          },
        ]
      : [];
  });
  /**
   * A plate the screen could not show.
   *
   * `attachedPhotos` is built by looking each link up among the project's
   * photographs, so a link pointing at a photograph this page did not load
   * would vanish from the screen while still printing in the PDF - the exact
   * shape of "the photographs I arranged are not the photographs that came
   * out". It should be impossible, and if it ever happens it is said out loud
   * rather than swallowed.
   */
  const unresolvedPlates = (photoLinksResult.data ?? []).length - attachedPhotos.length;

  const availablePhotos: ReportPhoto[] = photos
    .filter((photo) => !selectedPhotoIds.has(photo.id))
    .map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      category: photo.category,
      rotation: photo.rotation,
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

  // Three sections on screen, the same three the PDF prints, with every stored
  // section still written and still labelled - see lib/report-structure.ts.
  const [summaryGroup, evidenceGroup, outstandingGroup] = reportStructure(report.kind);
  const sectionRows = (sectionsResult.data ?? []).map((section) => ({
    ...section,
    type: section.section_type,
  }));
  const grouped = groupSections(report.kind, sectionRows);
  const groupFor = (key: string) => grouped.find((entry) => entry.group.key === key);
  // Everything the PDF prints from this payload is shown on the screen too:
  // the rows, the workstreams and the materials. See the panel component.
  const instructedWorks = parseInstructedWorks(
    (grouped.flatMap((entry) => entry.entries).find(
      (section) => section.section_type === "instructed_works",
    ))?.content,
  );
  /** Whether the summary group has anything in it yet, drafted or written. */
  const hasWrittenSummary = (groupFor("summary")?.entries ?? []).some((entry) =>
    entry.content?.trim(),
  );

  /** Every stored section of a group, written or not, for its one writing box. */
  const editorSections = (key: string) => {
    const entry = groupFor(key);
    if (!entry) return [];
    const byType = new Map(entry.entries.map((section) => [section.section_type, section]));
    return entry.group.sections.map((type) => {
      const row = byType.get(type as SummarySectionType);
      return {
        type,
        label: SUMMARY_SECTION_LABELS[type as SummarySectionType] ?? type,
        content: row?.content ?? null,
        aiGenerated: row?.ai_generated ?? true,
      };
    });
  };

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
            {[
              project?.name,
              summaryPeriodLabel(report.kind, report.period_start, report.period_end, formatDate),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge tone={isFinal ? "success" : "neutral"}>{isFinal ? "Final" : reopened ? "Reopened" : "Draft"}</Badge>
      </header>

      {/* One line, and deliberately only one. The evidence is frozen onto this
          document and a site manager needs to see that before he sees an empty
          writing box - but a panel of links here would be the clutter this
          screen was already carrying. The full list stays behind Advanced
          details below. */}
      {sourceLine ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          <Layers aria-hidden className="mt-0.5 size-4 shrink-0" />
          {sourceLine}
        </p>
      ) : null}

      {isFinal ? <Alert tone="info">This document has been issued and is no longer editable.</Alert> : null}
      {loadError ? <LoadError what="this report's contents" code={loadError.code} /> : null}

      {/* One. What the document says overall, then the record of how it was
          built - the title, the provenance and the reports behind it. That
          record is printed with the document, so it reads under the words
          rather than being folded away from them. */}
      {!loadError ? (
        <ReportSectionCard
          group={summaryGroup}
          records={
            isFinal && sourceItems.length === 0 ? undefined : (
              <>
                {!isFinal ? <SummaryDetails reportId={id} title={report.title} /> : null}

                {/* Written directly rather than consolidated. Said plainly,
                    because the difference is the whole point: this document has
                    no Daily Reports behind it and never claims any. A survey is
                    written from a visit, so it says nothing here at all. */}
                {!survey && standalone ? (
                  <p className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                    {describeProvenance(report.kind, 0)}
                  </p>
                ) : null}

                {sourceItems.length > 0 ? (
                  <section className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
                      Source evidence
                    </h3>
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
              </>
            )
          }
        >
          {!isFinal ? (
            <SummaryWriter
              reportId={id}
              sections={sectionsResult.data ?? []}
              configured={hasAiConfig()}
              sources={sourceCounts}
            />
          ) : null}

          {isFinal ? (
            <>
              <SectionProse entry={groupFor("summary")} />
              {instructedWorks ? <InstructedWorksPanel works={instructedWorks} /> : null}
            </>
          ) : consolidating && !hasWrittenSummary ? (
            /* Sources ticked and nothing written yet. The box says it is
               optional rather than being folded away: anything typed here
               reaches the client's PDF, so it is on the screen the person
               signs off. It once made a site manager think his Daily Reports
               had gone and he had to type the job again - the hint answers
               that, not a disclosure. */
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-muted">
                Optional. The report is written from the sources you have ticked - add your own
                notes here only if there is something they do not cover.
              </p>
              <GroupEditor
                key={JSON.stringify(editorSections("summary").map((section) => section.content))}
                groupKey="summary"
                groupLabel={summaryGroup.label}
                sections={editorSections("summary")}
                action={updateSummarySectionGroup.bind(null, id)}
              />
            </div>
          ) : (
            <GroupEditor
              key={JSON.stringify(editorSections("summary").map((section) => section.content))}
              groupKey="summary"
              groupLabel={summaryGroup.label}
              sections={editorSections("summary")}
              action={updateSummarySectionGroup.bind(null, id)}
            />
          )}
        </ReportSectionCard>
      ) : null}

      {/* Two. The photographs, and what the document is read alongside. */}
      {!loadError ? (
        <ReportSectionCard
          group={evidenceGroup}
          recordsLabel="Supporting documents"
          recordsHint={
            isFinal
              ? "The drawings, RAMS and other documents this document was issued against."
              : "Drawings, RAMS, permits and anything else this should be read alongside. They are listed in the PDF."
          }
          records={
            // Nothing at all where an issued report referenced no documents:
            // a heading over "No documents were referenced" is a sentence
            // nobody needs on a phone.
            isFinal && referencedDocuments.length === 0 ? undefined : isFinal ? (
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
            )
          }
        >
          {isFinal ? (
            <SectionProse entry={groupFor("evidence")} />
          ) : (
            <GroupEditor
              key={JSON.stringify(editorSections("evidence").map((section) => section.content))}
              groupKey="evidence"
              groupLabel={evidenceGroup.label}
              sections={editorSections("evidence")}
              action={updateSummarySectionGroup.bind(null, id)}
            />
          )}

          {/* Taken, captioned and removed without leaving the report - for a
              survey, and for a Progress Report written directly, where the
              photographs arrive with the report rather than before it. A report
              that consolidates issued Daily Reports keeps curating from what the
              project already holds, because it is written after the fact. */}
          {!isFinal && direct ? (
            <ReportPhotos
              reportId={id}
              companyId={session.companyId}
              projectId={report.project_id}
              photos={attachedPhotos}
              available={availablePhotos}
              aiConfigured={hasAiConfig()}
              // A survey records what is there before anybody has worked on
              // it, so its photographs start on Before. Everything else starts
              // unmarked: a status is something a person opts into.
              defaultCategory={survey ? "before" : undefined}
            />
          ) : null}

          {unresolvedPlates > 0 ? (
            <Alert tone="danger">
              {unresolvedPlates} {unresolvedPlates === 1 ? "photograph is" : "photographs are"} in
              this report but could not be loaded onto this screen, so what you see here is not
              what would be printed. Do not issue this report - reload it, and tell support if it
              persists.
            </Alert>
          ) : null}

          {/* A consolidating report chooses its photographs by ticking them in
              the form below, which says nothing about what order they print
              in. This is the same list and the same Reorder control, with the
              camera and the remove taken off - the curation form still owns
              which photographs are in, and this owns the order they appear. */}
          {!isFinal && !direct && attachedPhotos.length > 1 ? (
            <ReportPhotos
              reportId={id}
              companyId={session.companyId}
              projectId={report.project_id}
              photos={attachedPhotos}
              available={[]}
              aiConfigured={hasAiConfig()}
              manage={false}
            />
          ) : null}

          {/* The curation form is one form saving one selection. Where it
              carries photographs it belongs here; on a survey it is issues
              alone, and it belongs with them in the section below. */}
          {!isFinal && !direct ? (
            <SummaryCuration reportId={id} photos={photos} issues={issues} showPhotos={true} />
          ) : null}
        </ReportSectionCard>
      ) : null}

      {/* Three. What is still open, and what happens about it. */}
      {!loadError ? (
        <ReportSectionCard group={outstandingGroup}>
          {isFinal ? (
            <SectionProse entry={groupFor("outstanding")} />
          ) : (
            <GroupEditor
              key={JSON.stringify(editorSections("outstanding").map((section) => section.content))}
              groupKey="outstanding"
              groupLabel={outstandingGroup.label}
              sections={editorSections("outstanding")}
              action={updateSummarySectionGroup.bind(null, id)}
            />
          )}

          {!isFinal && direct ? (
            <SummaryCuration reportId={id} photos={photos} issues={issues} showPhotos={false} />
          ) : null}
        </ReportSectionCard>
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
          // Only the curated photographs: the cover has to be one of the
          // plates this report actually prints.
          photos={photos
            .filter((photo) => photo.selected)
            .map((photo) => ({
              id: photo.id,
              url: photo.url,
              label: photoPrintLabelText(photo),
            }))}
          shareName={issuedPdfFileName(
            SUMMARY_KIND_LABELS[report.kind],
            formatReportNumber(report.number),
            report.finalised_at,
          )}
        />
      ) : null}

      <div className="border-t border-line pt-6">
        <DeleteSummaryReport reportId={id} status={report.status} label={label} />
      </div>
    </div>
  );
}
