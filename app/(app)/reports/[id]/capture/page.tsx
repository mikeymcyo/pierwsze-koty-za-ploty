import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Camera } from "lucide-react";

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
import { signPhotoUrls } from "@/lib/photos-signing";
import { capturePreview, captureSpan, parseCaptureLog } from "@/lib/reports/capture-log";
import { withClockSkewRetry } from "@/lib/supabase/retry";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

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

  const urls = await signPhotoUrls((photoRows ?? []).map((photo) => photo.storage_path));
  const photos: PhotoWithUrl[] = (photoRows ?? []).map((photo) => ({
    ...photo,
    url: urls.get(photo.storage_path) ?? null,
  }));

  const entries = parseCaptureLog(report.raw_notes);
  const span = captureSpan(entries);
  const captureHref = `/reports/${report.id}/capture`;
  const projectHref = `/projects/${report.project_id}`;
  const documents = documentCount ?? 0;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackLink href={projectHref}>{project?.name ?? "Back"}</BackLink>
          <span className="text-sm text-ink-muted">{formatDate(report.report_date)}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Site Capture</h1>
      </header>

      {/* 1. Say what happened. */}
      <Card>
        <CardContent className="flex flex-col gap-4">
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
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-wide text-ink-muted uppercase">
            <Camera aria-hidden className="size-4" />
            Photos
          </h2>
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
        <CardContent className="flex flex-col gap-3">
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
      <details className="rounded-xl border border-line bg-surface-muted px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Today so far: {plural(entries.length, "note")} · {plural(photos.length, "photo")} ·{" "}
          {plural(documents, "document")}
          {span ? <span className="font-normal text-ink-subtle"> · {span.first} to {span.last}</span> : null}
        </summary>
        {entries.length > 0 ? (
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
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Nothing said yet.</p>
        )}
      </details>

      {/* 4. The one AI action. */}
      <PrepareDaily reportId={report.id} />
    </div>
  );
}
