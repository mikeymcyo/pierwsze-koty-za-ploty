import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Camera, CalendarDays, FileText, Sparkles } from "lucide-react";

import { adoptJobDocument } from "@/app/(app)/projects/brief-actions";
import { addCapture } from "@/app/(app)/reports/capture-actions";
import { DocumentUpload } from "@/components/documents/document-upload";
import { PhotoGrid, type PhotoWithUrl } from "@/components/reports/photo-grid";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { PrepareDaily } from "@/components/reports/prepare-daily";
import { SiteCaptureForm } from "@/components/reports/site-capture-form";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardContent } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/auth/session";
import { capturePreview, captureSpan, parseCaptureLog } from "@/lib/reports/capture-log";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { photoThumbUrl } from "@/lib/photos";

export const metadata: Metadata = { title: "Site Capture" };

// A document added here is read in the background after the response; the
// platform needs to know the function may outlive the page it returned.
export const maxDuration = 60;

/**
 * Site Capture: what a site operative holds.
 *
 * Four things, in the order somebody new would guess them: say what happened,
 * add photos, add a document if one turned up, Prepare Daily. Nothing on this
 * screen mentions the AI, the job context, a reading, a status or a report
 * number. The clever parts - the brief, the paperwork, what was read out of
 * it, the two-pass writer - all run underneath Prepare Daily.
 *
 * Ten seconds, no training: that is the test this screen is held to.
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
      .select("id, project_id, report_date, raw_notes, status, projects(name)")
      .eq("id", id)
      .maybeSingle(),
  );

  if (!report) notFound();
  // An issued report is a record of what was reported that day. There is
  // nothing to capture into it, so this sends the user to the document itself.
  if (report.status !== "draft") redirect(`/reports/${id}`);

  const project = Array.isArray(report.projects) ? report.projects[0] : report.projects;

  const [{ data: photoRows }, { count: documentCount }] = await Promise.all([
    withClockSkewRetry(() =>
      supabase
        .from("photos")
        .select("id, caption, category, storage_path, width, height, rotation")
        .eq("report_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ),
    // Documents SiteBoss will use for this job: the ones added here.
    supabase
      .from("job_context_documents")
      .select("document_id, documents!inner(project_id)", { count: "exact", head: true })
      .is("removed_at", null)
      .eq("documents.project_id", report.project_id),
  ]);

  const photos: PhotoWithUrl[] = (photoRows ?? []).map((photo) => ({
    ...photo,
    url: photoThumbUrl(photo.id),
  }));

  const entries = parseCaptureLog(report.raw_notes);
  const span = captureSpan(entries);
  const captureHref = `/reports/${report.id}/capture`;
  const projectHref = `/projects/${report.project_id}`;
  const documents = documentCount ?? 0;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <BackLink href={projectHref}>{project?.name ?? "Back"}</BackLink>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink md:text-3xl">
            Site Capture
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-muted">
            <CalendarDays aria-hidden className="size-3.5" />
            {formatDate(report.report_date)}
          </span>
        </div>
      </header>

      {/* 1. Say what happened. The question is the heading of the screen. */}
      <Card raised>
        <CardContent className="flex flex-col gap-4">
          {/* The field carries this as its accessible name; on screen it is
              the one question a tired operative has to read. */}
          <h2 aria-hidden className="text-xl font-bold tracking-tight text-ink">
            What happened on site?
          </h2>
          <SiteCaptureForm
            action={addCapture.bind(null, report.id)}
            entryCount={entries.length}
            reportId={report.id}
          />
        </CardContent>
      </Card>

      {/* 2. Photos. One button; the phone offers camera, library and files. */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-muted text-brand-ink">
              <Camera aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-ink">Photos</h2>
              <p className="text-sm text-ink-muted">Camera, library or files. They go on today&rsquo;s report.</p>
            </div>
          </div>
          <PhotoUpload
            companyId={session.companyId}
            projectId={report.project_id}
            reportId={report.id}
            simple
          />
          {photos.length > 0 ? (
            // No AI caption buttons here. Captions are proposed on the report,
            // if at all; this screen shows what was taken and nothing else.
            <PhotoGrid photos={photos} reportId={report.id} aiConfigured={false} />
          ) : null}
        </CardContent>
      </Card>

      {/* 3. A document, if one turned up. SiteBoss reads it in the background
          and uses it in Prepare Daily; nothing about that is shown here. */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-muted text-ink-muted">
              <FileText aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-ink">Documents</h2>
              <p className="text-sm text-ink-muted">A PDF or a photo of the paperwork.</p>
            </div>
          </div>
          <DocumentUpload
            companyId={session.companyId}
            projectId={report.project_id}
            label="Add document"
            simple
            onAttached={adoptJobDocument.bind(null, report.project_id, captureHref)}
            attachedLabel="Adding…"
          />
        </CardContent>
      </Card>

      {/* What has landed. Counts on the line; the notes themselves one tap
          away, because a worker came here to talk, not to read a timeline. */}
      <details className="group rounded-card bg-surface px-4 py-3 shadow-card ring-1 ring-line/70 ring-inset">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span>Today so far: {plural(entries.length, "note")} · {plural(photos.length, "photo")} · {plural(documents, "document")}</span>
            {span ? <span className="font-normal text-ink-subtle">· {span.first} to {span.last}</span> : null}
          </span>
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-subtle transition-transform duration-200 group-open:rotate-180">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </summary>
        {entries.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
            {entries.map((entry, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-xs text-ink-subtle">
                  {entry.at ?? "—"}
                </span>
                <span className="text-ink-muted">{capturePreview(entry.text)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">Nothing said yet.</p>
        )}
      </details>

      {/* 4. The one action that finishes the day. */}
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 px-1 text-sm text-ink-muted">
          <Sparkles aria-hidden className="size-4 text-brand" />
          Writes today&rsquo;s Daily from what you captured.
        </p>
        <PrepareDaily reportId={report.id} />
      </div>
    </div>
  );
}
