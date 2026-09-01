import "server-only";

import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";

import { comparable, type DocumentPage } from "@/lib/documents/extraction-schema";

/**
 * The text layer of a PDF, page by page.
 *
 * This is the substrate the whole extraction rests on. Every quote the model
 * returns is checked against what comes out of here, so what this function
 * misses is what the check will reject - which is why it returns pages
 * separately rather than one blob, and why it does not tidy anything up.
 *
 * pdfjs is already a dependency; the browser uses it to render the document
 * viewer. The legacy build is the one that runs under Node, and it is imported
 * dynamically so it never reaches a client bundle and costs nothing on the
 * requests that do not extract anything.
 *
 * ## Why it runs on Vercel at all
 *
 * pdfjs 5 is one module for rendering and reading alike, and its rendering
 * half needs a canvas. Under Node it tries to borrow `DOMMatrix`, `ImageData`
 * and `Path2D` from the optional native package `@napi-rs/canvas`, and when
 * that is absent it warns and carries on - until line 17006, where the display
 * layer does `const SCALE_MATRIX = new DOMMatrix()` at module top level and
 * the whole import throws `ReferenceError: DOMMatrix is not defined`.
 *
 * Locally the optional package is installed, so nobody sees this. On Vercel a
 * function ships only the files the tracer can follow, the native package is
 * loaded through a computed require it cannot follow, and every extraction
 * failed before the model was ever called. That is the bug this block exists
 * to explain: the reproduction is hiding node_modules/@napi-rs and running
 * npm run test:document-intelligence.
 *
 * Reading a text layer never draws anything. So the three globals are given
 * stand-ins that exist - which is all the top-level line needs - and refuse to
 * do anything else. If a future pdfjs code path on this side ever tries to
 * draw, it fails loudly with a message naming this file rather than producing
 * garbage nobody can trace; shipping a 20 MB native canvas so that a text
 * reader can construct an identity matrix it never uses would be the wrong
 * trade.
 *
 * The package is also listed in next.config.ts under serverExternalPackages,
 * so Node loads the genuine file from node_modules rather than a bundled copy.
 * That matters for the second half of the same problem: with no Worker under
 * Node, pdfjs loads its fallback via `import("./pdf.worker.mjs")` relative to
 * itself, and inside a bundled chunk "itself" is a directory with no such
 * file in it.
 */

const CANVAS_STAND_IN =
  "pdfjs tried to draw while reading a text layer - see lib/documents/pdf-text.ts";

/** Constructible, because pdfjs constructs one at import time. Inert otherwise. */
class InertDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;
  isIdentity = true;
}

class RefusedImageData {
  constructor() {
    throw new Error(CANVAS_STAND_IN);
  }
}

class RefusedPath2D {
  constructor() {
    throw new Error(CANVAS_STAND_IN);
  }
}

/**
 * Installed once, before pdfjs is first imported, and never over a real one:
 * a runtime that has these already keeps them.
 */
function installCanvasStandIns(): void {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= InertDOMMatrix;
  g.ImageData ??= RefusedImageData;
  g.Path2D ??= RefusedPath2D;
}

/** Beyond this a job's paperwork is a drawing set, not a document to read. */
export const MAX_EXTRACT_PAGES = 40;

/**
 * How much text is sent to the model.
 *
 * A 40-page specification runs to far more than a prompt should carry. The cap
 * is applied by dropping whole pages off the end rather than truncating one
 * mid-sentence, so every page the model is given is a page it has in full -
 * a half page would produce quotes that fail the check for a reason nobody
 * could diagnose.
 */
export const MAX_EXTRACT_CHARACTERS = 120_000;

export type PdfText = {
  pages: DocumentPage[];
  /** Pages in the file, which may exceed the pages read. */
  pageCount: number;
  /** True where pages were left out for length. */
  truncated: boolean;
};

export type PdfTextResult =
  | { ok: true; text: PdfText }
  | { ok: false; error: string; reason: "unreadable" | "no_text_layer" };

/**
 * Joins one page's text items.
 *
 * pdfjs returns positioned runs, not sentences: a heading arrives letter by
 * letter and a table row arrives cell by cell. Runs are joined with a space
 * and pdfjs's own end-of-line marker becomes a newline, which is as much
 * reconstruction as is safe. Anything cleverer would be guessing at layout,
 * and a quote check that runs against a guess is worthless.
 */
function joinItems(items: (TextItem | TextMarkedContent)[]): string {
  let out = "";
  for (const item of items) {
    // Marked-content items carry structure, not characters. Skipped rather
    // than coerced: they would add nothing and shift every offset.
    if (!("str" in item)) continue;
    out += item.str;
    out += item.hasEOL ? "\n" : " ";
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

export async function extractPdfText(data: Uint8Array): Promise<PdfTextResult> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    installCanvasStandIns();
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (cause) {
    console.error("[siteboss] pdfjs could not be loaded:", cause);
    return { ok: false, reason: "unreadable", error: "The PDF reader is not available on this deployment." };
  }

  let document: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]> | null = null;
  try {
    document = await pdfjs.getDocument({
      data,
      // Fonts are irrelevant to a text layer and only cost time. Nothing here
      // renders: this reads the strings and throws the page away.
      useSystemFonts: false,
      disableFontFace: true,
    }).promise;

    const pageCount = document.numPages;
    const pages: DocumentPage[] = [];
    let characters = 0;
    let truncated = pageCount > MAX_EXTRACT_PAGES;

    for (let number = 1; number <= Math.min(pageCount, MAX_EXTRACT_PAGES); number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = joinItems(content.items);
      page.cleanup();

      if (characters + text.length > MAX_EXTRACT_CHARACTERS && pages.length > 0) {
        truncated = true;
        break;
      }
      characters += text.length;
      pages.push({ page: number, text });
    }

    // A PDF with no text layer is a scan or a vector drawing. Nothing has gone
    // wrong; there is simply nothing here to read, and saying so is more use
    // than a model inventing an order number from an image it never saw.
    if (!pages.some((page) => comparable(page.text).length > 0)) {
      return {
        ok: false,
        reason: "no_text_layer",
        error:
          "This PDF has no text in it - it looks like a scan or a drawing. Nothing was read from it.",
      };
    }

    return { ok: true, text: { pages, pageCount, truncated } };
  } catch (cause) {
    console.error("[siteboss] PDF text extraction failed:", cause);
    return {
      ok: false,
      reason: "unreadable",
      error: "This PDF could not be opened. It may be password protected or damaged.",
    };
  } finally {
    await document?.destroy().catch(() => {});
  }
}

/**
 * The pages as the model is given them, with the page numbers it must cite.
 *
 * The markers are not decoration: the model is told to quote from the page it
 * names, and this is the only thing telling it what the pages are.
 */
export function pagesForPrompt(pages: DocumentPage[]): string {
  return pages.map((page) => `[PAGE ${page.page}]\n${page.text}`).join("\n\n");
}
