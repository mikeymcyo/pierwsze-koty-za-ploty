"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Minus, Plus } from "lucide-react";

import { SharePdf } from "@/components/pdf/share-pdf";
import { Button } from "@/components/ui/button";

/**
 * Reading a report, full screen, without leaving the app.
 *
 * Two things had to be true and only one of them was. Opening the PDF in a new
 * tab hands it to Safari's own viewer, which has no relationship to SiteBoss
 * and no obvious route back - people were closing the tab, or the app, to
 * escape it. Framing it inside a page fixed the way out but not the reading:
 * **iOS Safari will not display a PDF in an `<iframe>`.** It draws a single
 * non-scrolling preview of page one, so a site manager on an iPhone could see
 * the top of his own report and nothing else, and still had to export the file
 * to Files to read it. That is the bug, not the fix.
 *
 * So the pages are drawn here, onto canvases, with pdf.js. The document fills
 * the screen over the app - no top bar, no bottom nav, nothing to scroll past
 * before the report starts - with Close on the left and Share on the right,
 * both inside the top safe area and both reachable with a thumb.
 *
 * This component has no renderer and never asks for one. Whether it is looking
 * at the issued file or at a draft preview is decided before it is called (see
 * lib/pdf/viewer-source.ts), which is what keeps an issued PDF immutable: it
 * cannot regenerate a document it can only draw.
 */

/** pdf.js's legacy build is transpiled; the modern one needs Safari 17.4. */
const PDF_WORKER_SRC = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** The scroll area's padding, in pixels: `p-3` on each side. */
const GUTTER = 24;

/**
 * How far a page may be magnified. An A4 page fitted to an iPhone is about a
 * third of its printed size, so reading one unmagnified is not really on
 * offer - but the canvases are drawn once, at the resolution this range needs,
 * and magnified with CSS, so a step costs nothing and stays sharp.
 */
const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

/**
 * Above this the canvases cost more memory than iOS reliably hands back. An A4
 * page at an iPhone's full 3x is about 7MB of canvas, and a report runs to ten
 * pages with the photographs in it.
 */
const MAX_DEVICE_SCALE = 2;

type Status = "loading" | "ready" | "error";

export function PdfViewer({
  src,
  title,
  backHref,
  backLabel,
  note,
  shareHref,
  shareName,
}: {
  /** Same-origin URL for the bytes. Issued or draft is the caller's decision. */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);

  const [status, setStatus] = useState<Status>(src ? "loading" : "error");
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(0);

  // The whole viewport belongs to the document while this is open. Letting the
  // report screen scroll underneath it is disorienting on a phone, and on iOS
  // it is what turns an over-scroll into the page behind moving.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Measured from the scroll area rather than from the pages, which grow when
  // they are magnified - measuring those would feed the zoom back into the fit
  // and never settle.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const measure = () => {
      const next = Math.max(node.clientWidth - GUTTER, 0);
      // Rotating a phone changes this. A scrollbar appearing changes it by a
      // few pixels, which is not worth redrawing every page for.
      setFitWidth((current) => (Math.abs(current - next) > 8 ? next : current));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!src || fitWidth === 0) return;

    let cancelled = false;
    const container = pagesRef.current;
    if (!container) return;

    // Held so it can be torn down if this effect is superseded mid-render: a
    // rotation part way through a long report would otherwise leave the
    // previous document's worker running and its pages half drawn.
    let opened: { destroy: () => Promise<void> } | null = null;

    const draw = async () => {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

        const doc = await pdfjs.getDocument({ url: src, withCredentials: true }).promise;
        opened = doc;
        if (cancelled) return;

        const deviceScale = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_SCALE);

        // Drawn into a detached fragment and swapped in at the end, so nobody
        // watches the previous rendering being dismantled page by page.
        const drawn = new DocumentFragment();

        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number);
          if (cancelled) return;

          const unscaled = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: (fitWidth / unscaled.width) * deviceScale,
          });

          const canvas = window.document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${fitWidth * zoomRef.current}px`;
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.className = "rounded-lg bg-white shadow-lg";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${number} of ${doc.numPages}`);

          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;

          drawn.append(canvas);
          page.cleanup();
        }

        container.replaceChildren(drawn);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        console.error("[siteboss] the PDF could not be displayed:", cause);
        setStatus("error");
      }
    };

    void draw();

    return () => {
      cancelled = true;
      void opened?.destroy();
    };
  }, [src, fitWidth]);

  // Magnifying is a CSS width on canvases already drawn at twice the fitted
  // size, so it is instant and does not go back to the document.
  useEffect(() => {
    zoomRef.current = zoom;
    const container = pagesRef.current;
    if (!container || fitWidth === 0) return;
    for (const canvas of Array.from(container.querySelectorAll("canvas"))) {
      canvas.style.width = `${fitWidth * zoom}px`;
    }
  }, [zoom, fitWidth, status]);

  const step = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
      return ZOOM_STEPS[Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1)];
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-sunken">
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-1 pt-[env(safe-area-inset-top,0px)]">
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          {/* A real link, not history.back(): somebody who opened this from a
              notification or a fresh tab has no history to go back through. */}
          <Link href={backHref} aria-label={backLabel}>
            <ChevronLeft aria-hidden />
            Close
          </Link>
        </Button>

        <div className="min-w-0 flex-1 py-2 text-center">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          {/* Two lines, not one: "this is a draft preview, not the issued
              record" is the sentence a truncation would cut in half. */}
          {note ? <p className="line-clamp-2 text-xs text-ink-muted">{note}</p> : null}
        </div>

        {shareHref ? (
          <SharePdf
            href={shareHref}
            fileName={shareName ?? "Report.pdf"}
            title={title}
            variant="ghost"
            size="sm"
          />
        ) : (
          // Keeps the title centred whether or not there is a file to share.
          <span className="w-20 shrink-0" aria-hidden />
        )}
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-auto overscroll-contain p-3">
        <div ref={pagesRef} className="mx-auto flex w-max min-w-full flex-col items-center gap-3" />

        {status === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-muted">
            <Loader2 className="size-8 animate-spin" aria-hidden />
            <p className="text-sm font-medium">Opening the report…</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm font-medium text-ink">
              {src
                ? "This report could not be displayed here. Nothing has happened to it."
                : "The PDF could not be reached just now. It has not been lost - try again in a moment."}
            </p>
            {src ? (
              <Button asChild variant="secondary">
                {/* Leaves the app, and says so. Only ever the way out of a
                    failure - it is the trap this screen exists to replace. */}
                <a href={src} target="_blank" rel="noopener noreferrer">
                  Open it outside SiteBoss
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href={backHref}>
                <ChevronLeft aria-hidden />
                {backLabel}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {status === "ready" ? (
        <div className="pointer-events-none absolute right-3 bottom-0 flex gap-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => step(-1)}
            disabled={zoom === ZOOM_STEPS[0]}
            aria-label="Reduce magnification"
            className="pointer-events-auto shadow-lg"
          >
            <Minus aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => step(1)}
            disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            aria-label="Magnify the page"
            className="pointer-events-auto shadow-lg"
          >
            <Plus aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
