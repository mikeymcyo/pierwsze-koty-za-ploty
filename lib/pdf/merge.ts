import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";

import { documentKindFromBytes } from "@/lib/documents/file-validation";

/**
 * Appends the supporting documents to the report, as pages rather than links.
 *
 * A signed URL printed into a PDF stops working within the hour and is useless
 * to a client who opens the file next month, so the issued document has to
 * contain the drawings and the RAMS themselves. pdf-lib copies page objects
 * between documents: the text stays text, a drawing stays vector, and nothing
 * is rasterised or re-encoded. The SiteBoss pages are untouched by this - they
 * arrive already rendered and are copied across as they are.
 *
 * No "server-only" guard here on purpose: this touches no secret and no
 * database, only bytes, which is what lets a test merge real PDFs and count
 * the pages. lib/pdf/document-attachments.ts, which fetches from storage, is
 * where the server boundary sits.
 *
 * A supporting document that is a photograph - a delivery note, a signed
 * permit, a marked-up drawing - is placed on an A4 page of its own, scaled to
 * fit and turned to match its own orientation, with its title above it so the
 * page reads as an appendix rather than a stray picture. The kind is decided
 * from the bytes, never from the recorded type, so an object uploaded before
 * the type was recorded is still read correctly.
 *
 * The result is one self-contained file. Once it is uploaded and the report is
 * marked issued, revising or deleting the project's copy of a drawing cannot
 * reach inside it.
 */

export type MergeAttachment = {
  /** Shown in the failure message, so it must be the title the user knows. */
  title: string;
  bytes: Buffer;
};

export type MergeResult =
  | { ok: true; pdf: Buffer; appendedPages: number }
  | { ok: false; failed: string[]; error: string };

/**
 * A PDF that cannot be read is never skipped quietly.
 *
 * Issuing a report whose register lists five drawings but whose pages contain
 * four is worse than not issuing it: nobody notices until the one that matters
 * is the one missing. So a document that cannot be parsed fails the whole
 * merge and is named.
 */
export async function mergeReportWithDocuments(
  report: Buffer,
  attachments: readonly MergeAttachment[],
): Promise<MergeResult> {
  if (attachments.length === 0) {
    return { ok: true, pdf: report, appendedPages: 0 };
  }

  let merged: PDFDocument;
  try {
    merged = await PDFDocument.load(new Uint8Array(report));
  } catch (cause) {
    console.error("[siteboss] could not reopen the rendered report for merging:", cause);
    return {
      ok: false,
      failed: [],
      error: "The report itself could not be prepared for merging. Nothing has been issued.",
    };
  }

  const failed: string[] = [];
  let appendedPages = 0;

  for (const attachment of attachments) {
    try {
      const kind = documentKindFromBytes(attachment.bytes);
      if (kind === "jpeg" || kind === "png") {
        await addImagePage(merged, attachment, kind);
        appendedPages += 1;
        continue;
      }

      // ignoreEncryption lets a permissions-flagged but readable PDF through -
      // a great many drawings are issued that way. A genuinely encrypted one
      // still throws, and lands in `failed` below.
      const source = await PDFDocument.load(new Uint8Array(attachment.bytes), {
        ignoreEncryption: true,
      });
      const pages = await merged.copyPages(source, source.getPageIndices());
      if (pages.length === 0) {
        failed.push(attachment.title);
        continue;
      }
      for (const page of pages) merged.addPage(page);
      appendedPages += pages.length;
    } catch (cause) {
      console.error(`[siteboss] could not merge "${attachment.title}":`, cause);
      failed.push(attachment.title);
    }
  }

  if (failed.length > 0) {
    return {
      ok: false,
      failed,
      error: describeMergeFailure(failed),
    };
  }

  try {
    const bytes = await merged.save();
    return { ok: true, pdf: Buffer.from(bytes), appendedPages };
  } catch (cause) {
    console.error("[siteboss] could not save the combined PDF:", cause);
    return {
      ok: false,
      failed: [],
      error: "The combined PDF could not be written. Nothing has been issued.",
    };
  }
}

/** The white space around an image page, in points. */
const IMAGE_PAGE_MARGIN = 36;
/** Room for the title line above the image. */
const IMAGE_TITLE_HEIGHT = 22;

/**
 * One A4 page carrying one photograph.
 *
 * Landscape photographs get a landscape page, so a wide delivery note is not
 * printed small in the middle of a portrait sheet. The image is scaled to fit
 * inside the margins and never scaled up beyond its own pixels' worth, then
 * centred in what is left under the title.
 */
async function addImagePage(
  merged: PDFDocument,
  attachment: MergeAttachment,
  kind: "jpeg" | "png",
): Promise<void> {
  const bytes = new Uint8Array(attachment.bytes);
  const image = kind === "jpeg" ? await merged.embedJpg(bytes) : await merged.embedPng(bytes);

  const [shortSide, longSide] = PageSizes.A4;
  const landscape = image.width > image.height;
  const pageWidth = landscape ? longSide : shortSide;
  const pageHeight = landscape ? shortSide : longSide;
  const page = merged.addPage([pageWidth, pageHeight]);

  const font = await merged.embedFont(StandardFonts.Helvetica);
  const titleSize = 9;
  const title = attachment.title.trim();
  if (title) {
    page.drawText(title, {
      x: IMAGE_PAGE_MARGIN,
      y: pageHeight - IMAGE_PAGE_MARGIN - titleSize,
      size: titleSize,
      font,
      color: rgb(0.35, 0.35, 0.35),
      maxWidth: pageWidth - IMAGE_PAGE_MARGIN * 2,
    });
  }

  const boxWidth = pageWidth - IMAGE_PAGE_MARGIN * 2;
  const boxHeight = pageHeight - IMAGE_PAGE_MARGIN * 2 - IMAGE_TITLE_HEIGHT;
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: IMAGE_PAGE_MARGIN + (boxWidth - width) / 2,
    y: IMAGE_PAGE_MARGIN + (boxHeight - height) / 2,
    width,
    height,
  });
}

/** Named, so the user knows which file to replace rather than which to guess at. */
export function describeMergeFailure(failed: readonly string[]): string {
  if (failed.length === 0) return "";
  const list = failed.join(", ");
  return failed.length === 1
    ? `"${list}" could not be read as a PDF or image, so nothing has been issued. Replace or unlink that document and try again.`
    : `${failed.length} supporting documents could not be read as PDFs or images, so nothing has been issued: ${list}. Replace or unlink them and try again.`;
}
