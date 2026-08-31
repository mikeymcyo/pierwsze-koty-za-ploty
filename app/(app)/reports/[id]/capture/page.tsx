import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Camera, Mic } from "lucide-react";

import { addCapture } from "@/app/(app)/reports/capture-actions";
import { PhotoGrid, type PhotoWithUrl } from "@/components/reports/photo-grid";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { SiteCaptureForm } from "@/components/reports/site-capture-form";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/auth/session";
import { hasAiConfig } from "@/lib/ai/report-generation";
import { signPhotoUrls } from "@/lib/photos-signing";
import { capturePreview, captureSpan, parseCaptureLog } from "@/lib/reports/capture-log";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatReportNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Site Capture" };

/**
 * Site Capture: the screen somebody actually stands on site holding.
 *
 * Four things and nothing else - speak, add photographs, see what has gone in
 * already, and leave. Everything a Daily Report also needs - the weather, the
 * workforce, the drafting, the review, the issue list, the PDF - is one tap
 * away on the report itself and stays there. This screen is for the hour you
 * are on site, not the ten minutes at the end of the day.
 */
export default async function SiteCapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSessionContext();
  const supabase = await createClient();

  const { data: report } = await withClockSkewRetry(() =>
    supabase
      .from("reports")
      .select("id, project_id, report_number, report_date, raw_notes, status, projects(name)")
      .eq("id", id)
      .maybeSingle(),
  );

  if (!report) notFound();
  // An issued report is a record of what was reported that day. There is
  // nothing to capture into it, so this sends the user to the document itself
  // rather than showing a microphone that would be refused.
  if (report.status !== "draft") redirect(`/reports/${id}`);

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  const { data: photoRows } = await withClockSkewRetry(() =>
    supabase
      .from("photos")
      .select("id, caption, category, storage_path, width, height, rotation")
      .eq("report_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  );

  const urls = await signPhotoUrls((photoRows ?? []).map((photo) => photo.storage_path));
  const photos: PhotoWithUrl[] = (photoRows ?? []).map((photo) => ({
    ...photo,
    url: urls.get(photo.storage_path) ?? null,
  }));

  const entries = parseCaptureLog(report.raw_notes);
  const span = captureSpan(entries);
  const reportHref = `/reports/${report.id}`;
  const projectHref = `/projects/${report.project_id}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href={projectHref}>{project?.name ?? "Back"}</BackLink>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink md:text-3xl">
            <Mic aria-hidden className="size-6" />
            Site Capture
          </h1>
          <p className="text-sm text-ink-muted">
            {[project?.name, formatDate(report.report_date)].filter(Boolean).join(" · ")} ·
            Report {formatReportNumber(report.report_number)}
          </p>
        </div>
        <Badge tone="neutral">Draft</Badge>
      </header>

      <p className="text-sm text-ink-muted">
        Speak whenever you have a minute. Everything you add goes onto{" "}
        <strong className="font-semibold text-ink">the same report for today</strong> - come
        back as often as you like, nothing is replaced.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <SiteCaptureForm
            action={addCapture.bind(null, report.id)}
            entryCount={entries.length}
            reportId={report.id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-muted uppercase">
            <Camera aria-hidden className="size-4" />
            Photographs
          </h2>
          <PhotoUpload
            companyId={session.companyId}
            projectId={report.project_id}
            reportId={report.id}
          />
          {photos.length > 0 ? (
            <PhotoGrid photos={photos} aiConfigured={hasAiConfig()} reportId={report.id} />
          ) : null}
        </CardContent>
      </Card>

      {entries.length > 0 ? (
        <details className="rounded-xl border border-line bg-surface-muted p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Today so far - {entries.length} {entries.length === 1 ? "note" : "notes"}
            {span ? ` · ${span.first} to ${span.last}` : ""}
          </summary>
          {/* Kept closed by default and kept short. The chronology is recorded,
              but a site manager came here to talk, not to read a timeline. */}
          <ul className="mt-3 flex flex-col gap-3">
            {entries.map((entry, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs text-ink-subtle">
                  {entry.at ?? "—"}
                </span>
                <span className="text-ink-muted">{capturePreview(entry.text)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-subtle">
            Every word is kept exactly as you said it. Corrections are made on the report
            itself.
          </p>
        </details>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Continue later is a link and nothing else: everything is already
            saved the moment it is added, so there is no unsaved state to warn
            about and no confirmation to tap through. */}
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
          <Link href={projectHref}>Continue later</Link>
        </Button>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={reportHref}>
            Finish the report
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>

      <p className="text-sm text-ink-muted">
        At the end of the day, open the report to have the AI tidy every note into the
        write-up, review it, and issue the PDF.
      </p>
    </div>
  );
}
