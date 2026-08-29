/**
 * How an issued document is presented: which style it is printed in, and
 * whether it opens on a photograph.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a renderer, and so the picker on the finalise screen can
 * import them without dragging the PDF renderer into the browser bundle.
 *
 * Three styles, fixed. This is deliberately not a theme designer: a client
 * receiving paperwork from the same contractor should recognise it, and a
 * product that lets every report be coloured differently produces documents
 * that look like they came from different companies. Three named ways to print
 * the same document is a choice; a colour picker is a liability.
 *
 * The choice is not stored. It is made on the finalise screen, carried into
 * the render, and baked into the PDF that is issued - which is where it
 * belongs, because the issued PDF is the record and the record cannot change
 * afterwards. Re-issuing a reopened report is where a different choice takes
 * effect. Nothing about this needed a migration.
 */

export const PDF_STYLES = ["siteboss", "corporate", "photo"] as const;

export type PdfStyle = (typeof PDF_STYLES)[number];

export const DEFAULT_PDF_STYLE: PdfStyle = "siteboss";

export const PDF_STYLE_LABELS: Record<PdfStyle, string> = {
  siteboss: "SiteBoss",
  corporate: "Corporate",
  photo: "Photo",
};

/** One line each, so the choice is made from what it does rather than its name. */
export const PDF_STYLE_DESCRIPTIONS: Record<PdfStyle, string> = {
  siteboss: "The house document: charcoal, with the amber accent used sparingly.",
  corporate: "White and grey, no accent colour. For a client whose paperwork is formal.",
  photo: "The photographs given room - a large cover image and bigger plates.",
};

export function isPdfStyle(value: string | null | undefined): value is PdfStyle {
  return PDF_STYLES.includes(value as PdfStyle);
}

/**
 * The style a form field or query parameter asked for.
 *
 * Anything unrecognised falls back to the house style rather than failing: a
 * mistyped URL must not stop a report being issued.
 */
export function pdfStyleOf(value: string | null | undefined): PdfStyle {
  return isPdfStyle(value) ? value : DEFAULT_PDF_STYLE;
}

/**
 * The cover photograph asked for, or null.
 *
 * "No cover photo" is a valid answer and the default one, so an empty field,
 * an absent parameter and the word "none" all mean the same thing.
 */
export function coverPhotoIdOf(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || id === "none") return null;
  return id;
}

/**
 * The cover photograph itself, chosen from the photographs the document is
 * already printing.
 *
 * That constraint is the whole design: the cover is one of the report's own
 * plates, so nothing is uploaded, copied or stored a second time to have one,
 * and a cover can never show a photograph the report does not otherwise
 * contain. A id that is no longer among them - a photograph removed after the
 * choice was made - simply produces no cover, which is a valid document.
 */
export function pickCoverPhoto<T extends { id: string }>(
  photos: readonly T[],
  coverPhotoId: string | null | undefined,
): T | null {
  if (!coverPhotoId) return null;
  return photos.find((photo) => photo.id === coverPhotoId) ?? null;
}

/** One line under the picker, so somebody knows what they are about to issue. */
export function describePresentation(input: {
  style: PdfStyle;
  hasCover: boolean;
  photoCount: number;
}): string {
  const style = PDF_STYLE_LABELS[input.style];
  if (input.photoCount === 0) {
    return `${style} style. This report has no photographs, so it has no cover image.`;
  }
  if (!input.hasCover) {
    return `${style} style, opening on the report itself rather than on a photograph.`;
  }
  return input.style === "photo"
    ? `${style} style, opening on your cover photograph at full width.`
    : `${style} style, with your cover photograph across the head of the first page.`;
}

/**
 * What the file is called when it lands in somebody's WhatsApp or Downloads.
 *
 * The client's own words for it - the document, its number and its date -
 * because "download.pdf" in a chat thread three weeks later is worth nothing.
 * Anything a filesystem or a messaging app might object to is replaced.
 */
export function issuedPdfFileName(
  documentType: string,
  number: string,
  date: string | null | undefined,
): string {
  const day = (date ?? "").slice(0, 10);
  const parts = [documentType, number, day].filter(Boolean).join(" ");
  const safe = parts
    .replace(/[^A-Za-z0-9 .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Report"}.pdf`;
}
