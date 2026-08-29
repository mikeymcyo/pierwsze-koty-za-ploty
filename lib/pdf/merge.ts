import { PDFDocument } from "pdf-lib";

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

/** Named, so the user knows which file to replace rather than which to guess at. */
export function describeMergeFailure(failed: readonly string[]): string {
  if (failed.length === 0) return "";
  const list = failed.join(", ");
  return failed.length === 1
    ? `"${list}" could not be read as a PDF, so nothing has been issued. Replace or unlink that document and try again.`
    : `${failed.length} supporting documents could not be read as PDFs, so nothing has been issued: ${list}. Replace or unlink them and try again.`;
}
