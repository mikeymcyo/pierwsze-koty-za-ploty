import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SummaryCuration, type CuratedIssueChoice, type CuratedPhotoChoice } from "@/components/summary-reports/summary-curation";
import { SummaryDetails } from "@/components/summary-reports/summary-details";
import { SummaryDraft } from "@/components/summary-reports/summary-draft";
import { SummaryFinalise } from "@/components/summary-reports/summary-finalise";
import { DeleteSummaryReport } from "@/components/summary-reports/summary-lifecycle";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { hasAiConfig } from "@/lib/ai/report-generation";
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
  await requireSessionContext();
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

      {!loadError ? (
        <SummaryFinalise
          reportId={id}
          status={report.status}
          hasPdf={Boolean(report.pdf_path)}
          finalisedAt={formatDate(report.finalised_at)}
        />
      ) : null}

      <div className="border-t border-line pt-6">
        <DeleteSummaryReport reportId={id} status={report.status} label={label} />
      </div>
    </div>
  );
}
