"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
 * ## Where it sits
 *
 * Rendered through a portal onto `document.body`, not inside the page. The
 * app's page wrapper fades in, and an animated opacity makes a stacking
 * context: a `position: fixed` element inside it, whatever its z-index, is
 * layered against the top bar and the bottom nav as its wrapper, not as
 * itself - so the glass header sat over the reader's Close and Share, and the
 * nav sat over its zoom buttons. From the body there is no wrapper to lose to.
 *
 * ## How sharp it is
 *
 * Only the pages near the viewport are drawn, and they are drawn at the
 * screen's real pixel density and the current magnification. Both halves of
 * that matter. A report with thirty-five photographs runs to twenty pages,
 * and twenty canvases at an iPhone's full density is more memory than iOS
 * gives a page, so the old reader drew everything at once and paid for it by
 * capping density at 2x and magnifying with CSS - which meant every plate was
 * drawn at a third of the pixels the screen has and stretched to fit. The
 * stored photograph is 1600px across; the plate reached the eye through a
 * 300px canvas. Drawing the two or three pages in view at full density, and
 * releasing the rest as they scroll away, is what puts the detail back
 * without holding the whole report in memory.
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

/** How far a page may be magnified. Each step is redrawn at that size. */
const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

/** The densest screen drawn for: an iPhone is 3x, an iPad 2x. */
const MAX_DEVICE_SCALE = 3;

/**
 * The most pixels one page's canvas may hold. An A4 page fitted to an iPhone
 * at 3x magnification and 3x density is about 15 million; iOS has been known
 * to hand back a blank canvas above 16. A page that would exceed this is
 * drawn a little less densely rather than not at all.
 */
const MAX_CANVAS_PIXELS = 12_000_000;

/**
 * How far beyond the viewport a page is drawn ahead, as a share of the
 * viewport's height. Half a screen each way keeps the next page ready as it
 * scrolls in without holding a magnified report's worth of canvases.
 */
const AHEAD = "60% 0px";

type Status = "loading" | "ready" | "error";

type PageSlot = {
  number: number;
  /** The page's own size in points, from pdf.js at scale 1. */
  width: number;
  height: number;
  node: HTMLDivElement;
  /** The scale the canvas in the slot was drawn at, or null with no canvas. */
  drawnAt: number | null;
  task: { cancel: () => void } | null;
};

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvas: HTMLCanvasElement;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup: () => void;
};

type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

/** The CSS size of a page at a fit width and magnification. */
function cssSize(slot: Pick<PageSlot, "width" | "height">, fit: number, zoom: number) {
  const width = fit * zoom;
  return { width, height: (width * slot.height) / slot.width };
}

/** Sizes every slot for the fit and magnification; canvases inside stretch with them. */
function layOut(slots: readonly PageSlot[], fit: number, zoom: number) {
  for (const slot of slots) {
    const size = cssSize(slot, fit, zoom);
    slot.node.style.width = `${size.width}px`;
    slot.node.style.height = `${size.height}px`;
  }
}

// The portal needs a document, which the server has not got. The server
// snapshot says so; the client's says otherwise once hydrated.
const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

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
  const docRef = useRef<PdfDocument | null>(null);
  const slotsRef = useRef<PageSlot[]>([]);
  const visibleRef = useRef(new Set<number>());
  const zoomRef = useRef(1);
  const fitRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const mounted = useSyncExternalStore(noop, onClient, onServer);
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
  }, [mounted]);

  /** Drops a slot's canvas and any drawing in flight, keeping its size. */
  const release = useCallback((slot: PageSlot) => {
    slot.task?.cancel();
    slot.task = null;
    slot.drawnAt = null;
    slot.node.replaceChildren();
  }, []);

  /**
   * Draws one page into its slot at the density the screen needs now.
   *
   * The canvas is sized to the screen's pixels and then laid over the slot at
   * the slot's CSS size, so a change of magnification stretches the old
   * canvas for the instant it takes to draw the new one, and never shows an
   * empty box where a page was.
   */
  const draw = useCallback(
    async (slot: PageSlot) => {
      const doc = docRef.current;
      if (!doc) return;

      const { width } = cssSize(slot, fitRef.current, zoomRef.current);
      const density = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_SCALE);
      let scale = (width / slot.width) * density;
      const pixels = slot.width * slot.height * scale * scale;
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);

      // Already drawn at this density, or being drawn at it.
      if (slot.drawnAt === scale) return;
      slot.task?.cancel();
      slot.task = null;
      slot.drawnAt = scale;

      try {
        const page = await doc.getPage(slot.number);
        if (slot.drawnAt !== scale) return;

        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        canvas.className = "rounded-lg";

        const task = page.render({ canvas, viewport });
        slot.task = task;
        await task.promise;
        if (slot.drawnAt !== scale) return;

        slot.task = null;
        slot.node.replaceChildren(canvas);
        page.cleanup();
        setStatus("ready");
      } catch (cause) {
        // A cancelled drawing is the expected outcome of scrolling or
        // magnifying before it finished. Anything else is a real failure.
        if (cause && typeof cause === "object" && (cause as { name?: string }).name === "RenderingCancelledException") return;
        if (slot.drawnAt === scale) slot.drawnAt = null;
        console.error("[siteboss] a page could not be drawn:", cause);
      }
    },
    [],
  );

  /** Draws what is in view and releases what is not, a moment after things settle. */
  const settle = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      for (const slot of slotsRef.current) {
        if (visibleRef.current.has(slot.number)) void draw(slot);
        else if (slot.drawnAt !== null) release(slot);
      }
    }, 80);
  }, [draw, release]);

  // Opens the document and lays out one slot per page, at the page's own
  // shape, so the report has its full length from the start and scrolling to
  // page twelve is possible before page twelve has been drawn.
  useEffect(() => {
    if (!src || !mounted) return;
    const container = pagesRef.current;
    const scroller = scrollRef.current;
    if (!container || !scroller) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const open = async () => {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

        const doc = (await pdfjs.getDocument({ url: src, withCredentials: true }).promise) as unknown as PdfDocument;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;

        const slots: PageSlot[] = [];
        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number);
          if (cancelled) return;
          const { width, height } = page.getViewport({ scale: 1 });
          const node = window.document.createElement("div");
          node.className = "shrink-0 rounded-lg bg-white shadow-lg";
          node.dataset.page = String(number);
          node.setAttribute("role", "img");
          node.setAttribute("aria-label", `Page ${number} of ${doc.numPages}`);
          slots.push({ number, width, height, node, drawnAt: null, task: null });
          page.cleanup();
        }
        slotsRef.current = slots;
        visibleRef.current = new Set();
        layOut(slots, fitRef.current, zoomRef.current);
        container.replaceChildren(...slots.map((slot) => slot.node));

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const number = Number((entry.target as HTMLElement).dataset.page);
              if (entry.isIntersecting) visibleRef.current.add(number);
              else visibleRef.current.delete(number);
            }
            settle();
          },
          { root: scroller, rootMargin: AHEAD },
        );
        for (const slot of slots) observer.observe(slot.node);
      } catch (cause) {
        if (cancelled) return;
        console.error("[siteboss] the PDF could not be displayed:", cause);
        setStatus("error");
      }
    };

    void open();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      for (const slot of slotsRef.current) release(slot);
      slotsRef.current = [];
      const doc = docRef.current;
      docRef.current = null;
      void doc?.destroy();
    };
  }, [src, mounted, settle, release]);

  // A new fit or magnification resizes every slot at once - the canvases
  // already there stretch with them - and keeps the reader's place on the
  // page, then the pages in view are redrawn at the size they now have.
  useEffect(() => {
    const scroller = scrollRef.current;
    const previous = zoomRef.current * (fitRef.current || fitWidth);
    zoomRef.current = zoom;
    fitRef.current = fitWidth;
    if (fitWidth === 0) return;

    const ratio = previous > 0 ? (zoom * fitWidth) / previous : 1;
    layOut(slotsRef.current, fitWidth, zoom);
    if (scroller && ratio !== 1) {
      scroller.scrollTop = scroller.scrollTop * ratio;
      scroller.scrollLeft = scroller.scrollLeft * ratio;
    }
    settle();
  }, [zoom, fitWidth, settle]);

  const step = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
      return ZOOM_STEPS[Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1)];
    });
  }, []);

  if (!mounted) return null;

  return createPortal(
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
          // A filled button, not a ghost: this is the one thing a person
          // opens the issued report to do next, and it has to read as a
          // button at a glance beside the title.
          <span className="shrink-0 py-1 pr-1">
            <SharePdf
              href={shareHref}
              fileName={shareName ?? "Report.pdf"}
              title={title}
              variant="secondary"
              size="sm"
            />
          </span>
        ) : (
          // Keeps the title centred whether or not there is a file to share.
          <span className="w-20 shrink-0" aria-hidden />
        )}
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-auto overscroll-contain p-3">
        <div ref={pagesRef} className="mx-auto flex w-max min-w-full flex-col items-center gap-3" />

        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-muted">
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
    </div>,
    document.body,
  );
}
