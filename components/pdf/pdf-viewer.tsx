import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { SharePdf } from "@/components/pdf/share-pdf";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * A PDF with a way back out.
 *
 * Opening a PDF in a new tab is what broke this on the iPad: iOS hands the
 * file to its own full-screen viewer, which has no relationship to the app and
 * no obvious route back to the report - people were closing the tab, or the
 * app, to escape it. So the document is framed inside a normal page instead,
 * with Back as the first thing in the header and above the fold on a phone.
 *
 * Full screen is still one tap away, and deliberately labelled as leaving the
 * app, which is also the fallback anywhere the frame will not render a PDF.
 */
export function PdfViewer({
  src,
  title,
  backHref,
  backLabel,
  note,
  shareHref,
  shareName,
}: {
  src: string | null;
  title: string;
  backHref: string;
  backLabel: string;
  note?: string;
  /**
   * Where the stored, issued PDF can be fetched from, when there is one. Only
   * an issued document is offered for sharing: a draft preview is not the
   * record and must not leave the app as though it were.
   */
  shareHref?: string;
  shareName?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="lg">
          <Link href={backHref}>
            <ArrowLeft aria-hidden />
            {backLabel}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {shareHref ? (
            <SharePdf href={shareHref} fileName={shareName ?? "Report.pdf"} title={title} />
          ) : null}
          {src ? (
            <Button asChild variant="ghost">
              <a href={src} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Open full screen
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {note ? <p className="mt-1 text-sm text-ink-muted">{note}</p> : null}
      </div>

      {src ? (
        <div className="h-[70dvh] min-h-96 overflow-hidden rounded-xl border border-line bg-surface-muted">
          <iframe src={src} title={title} className="size-full" />
        </div>
      ) : (
        <Alert tone="danger">
          The PDF could not be reached just now. It has not been lost - try again in a moment.
        </Alert>
      )}

      <Button asChild variant="secondary" size="lg" className="self-start">
        <Link href={backHref}>
          <ArrowLeft aria-hidden />
          {backLabel}
        </Link>
      </Button>
    </div>
  );
}
