"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BookOpen, ChevronDown, FileCheck2, FileText } from "lucide-react";

import { finaliseReport, type FinaliseState } from "@/app/(app)/reports/finalise-actions";
import { PdfPresentation, type CoverChoice } from "@/components/pdf/pdf-presentation";
import { SharePdf } from "@/components/pdf/share-pdf";
import { ReopenReport } from "@/components/reports/report-lifecycle";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DEFAULT_PDF_STYLE, describePresentation, type PdfStyle } from "@/lib/pdf/presentation";
import { describePackageChoice, documentsFlag } from "@/lib/reports/document-package";

function FinaliseButton({ reissue }: { reissue: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
      <FileCheck2 aria-hidden />
      {pending ? "Issuing…" : reissue ? "Finalise again" : "Finalise report"}
    </Button>
  );
}

/**
 * Finalising, and what you get afterwards.
 *
 * Three states share this space. A plain draft offers a preview and the button
 * that issues it. An issued report offers the stored PDF and the way back into
 * editing. A reopened report - a draft that already has an issued PDF - is the
 * one worth being careful about: the document the client holds has not been
 * withdrawn, and saying so plainly is what stops somebody re-issuing in a panic.
 */
export function FinaliseReport({
  reportId,
  status,
  hasPdf,
  finalisedAt,
  documentCount = 0,
  photos = [],
  shareName,
}: {
  reportId: string;
  status: "draft" | "final";
  hasPdf: boolean;
  finalisedAt: string | null;
  /** Linked supporting documents, which the issued PDF can carry in full. */
  documentCount?: number;
  /** This report's own photographs, any of which can be its cover. */
  photos?: CoverChoice[];
  /** What the shared file is called on the device that receives it. */
  shareName?: string;
}) {
  const finalise = finaliseReport.bind(null, reportId);
  const [state, formAction] = useActionState<FinaliseState, FormData>(finalise, {});
  const reopened = status === "draft" && hasPdf;
  // Default on: somebody who linked a drawing meant it to go with the report.
  const [includeDocuments, setIncludeDocuments] = useState(true);
  // The house style and no cover: the report as SiteBoss has always issued it.
  // A different choice is deliberate, never the default.
  const [style, setStyle] = useState<PdfStyle>(DEFAULT_PDF_STYLE);
  const [cover, setCover] = useState<string | null>(null);
  const presentation = `&style=${style}${cover ? `&cover=${cover}` : ""}`;

  if (status === "final") {
    return (
      <section className="flex flex-col gap-4 rounded-card bg-surface-raised p-5 shadow-raised ring-1 ring-line/70 ring-inset md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold tracking-tight text-ink">Issued report</h2>
          <p className="text-sm text-ink-muted">
            {finalisedAt ? `Issued on ${finalisedAt}. ` : ""}The PDF is the record that went out and is not regenerated.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/reports/${reportId}/pdf`}>
              <BookOpen aria-hidden />
              View report
            </Link>
          </Button>
          {/* The issued file itself, handed to the device's own share sheet.
              Nothing is re-rendered to send it. */}
          <SharePdf
            href={`/reports/${reportId}/file`}
            fileName={shareName ?? "Daily Report.pdf"}
            title={shareName ?? "Daily Report"}
          />
        </div>

        <ReopenReport reportId={reportId} finalisedAt={finalisedAt} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface-raised p-5 shadow-raised ring-1 ring-line/70 ring-inset md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold tracking-tight text-ink">
          {reopened ? "Reopened for editing" : "Finalise"}
        </h2>
        <p className="text-sm text-ink-muted">
          {reopened
            ? "Make your corrections, then issue the report again. The PDF already sent stays in place until you do."
            : "Preview it, then finalise. Finalising issues the PDF and closes the report."}
        </p>
      </div>

      {reopened ? (
        <Alert tone="info">
          The previously issued PDF is still the current document. Finalising again replaces it; leaving
          this report as it is changes nothing.
        </Alert>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {/* The house style is the default and the right answer nearly every
          time, so the chooser folds; the line on the fold says what will be
          issued, so nothing is chosen unseen. */}
      <details className="group rounded-control bg-surface ring-1 ring-line/70 ring-inset">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Presentation</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              {describePresentation({ style, hasCover: Boolean(cover), photoCount: photos.length })}
            </span>
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-3">
          <PdfPresentation
            style={style}
            onStyle={setStyle}
            cover={cover}
            onCover={setCover}
            photos={photos}
          />
        </div>
      </details>

      {documentCount > 0 ? (
        <label className="flex items-start gap-3 rounded-control bg-surface p-3 ring-1 ring-line/70 ring-inset">
          <input
            type="checkbox"
            checked={includeDocuments}
            onChange={(event) => setIncludeDocuments(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-brand"
          />
          <span className="min-w-0">
            <span className="block font-medium text-ink">
              Include supporting documents in the PDF
            </span>
            <span className="mt-1 block text-sm text-ink-muted">
              {describePackageChoice({ include: includeDocuments, documentCount })}
            </span>
          </span>
        </label>
      ) : null}

      {/* Preview, then Finalise: the order a person does them in. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
          <Link
            href={`/reports/${reportId}/pdf?draft=1&documents=${documentsFlag(
              includeDocuments,
            )}${presentation}`}
          >
            <FileText aria-hidden />
            {reopened ? "Preview your changes" : "Preview"}
          </Link>
        </Button>

        <form action={formAction} className="contents sm:block">
          <input type="hidden" name="includeDocuments" value={documentsFlag(includeDocuments)} />
          {/* The presentation goes with the render, so what was previewed is
              what gets issued. */}
          <input type="hidden" name="pdfStyle" value={style} />
          <input type="hidden" name="coverPhoto" value={cover ?? ""} />
          <FinaliseButton reissue={reopened} />
        </form>

        {reopened ? (
          <>
            <Button asChild variant="ghost" size="lg">
              <Link href={`/reports/${reportId}/pdf`}>View the issued PDF</Link>
            </Button>
            {/* Still the document the client holds, so it can still be sent. */}
            <SharePdf
              href={`/reports/${reportId}/file`}
              fileName={shareName ?? "Daily Report.pdf"}
              title={shareName ?? "Daily Report"}
              variant="ghost"
            />
          </>
        ) : null}
      </div>

    </section>
  );
}
