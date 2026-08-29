/**
 * Whether a chosen file is really a PDF.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a browser and read the same way from the uploader and its
 * tests.
 *
 * ## Why the picker filters nothing at all
 *
 * The file input carries no `accept` attribute, deliberately, and one must not
 * be added back.
 *
 * `accept="application/pdf"` greyed out genuine PDFs on an iPad, in Recents,
 * iCloud Drive, Downloads and Inbox alike. Safari maps a MIME type to a
 * Uniform Type Identifier and then lets the Files browser enable only items
 * whose provider declares conformance to it; a PDF synced into iCloud Drive,
 * saved from Safari into Downloads, or surfaced by Dropbox or Google Drive is
 * frequently advertised as `public.data` or with no type at all. Narrowing the
 * attribute to `.pdf` alone was tried next and behaved identically, because the
 * extension maps to that same UTI - so the file the user came to attach stayed
 * untappable and the feature was unusable on the device it exists for.
 *
 * An attribute that hides the file somebody is trying to attach is worse than
 * no attribute. Without it the picker lists everything, the user taps the PDF
 * they can see, and this module decides.
 *
 * ## Why that does not weaken anything
 *
 * A picker's `accept` was never a guarantee - it is a filter on what is easy
 * to tap, and the Files browser lets a determined tap through regardless.
 * Nothing downstream ever trusted it. The real check is below and is stricter
 * than the attribute ever was: the name must end `.pdf`, the file must be
 * non-empty and within the bucket's limit, and its first bytes must actually
 * read `%PDF-`. A renamed photograph is refused here rather than uploaded and
 * served to a client as a drawing, and the bucket stays PDF-only besides.
 *
 * The cost is that a non-PDF is now refused after the tap rather than being
 * greyed out before it, so the message it is refused with has to be worth
 * reading. That is what checkDocumentFile returns.
 */

/** Matches the project-documents bucket's own limit. */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * What the object is stored as, whatever the device called it.
 *
 * The bucket is PDF-only, and iOS routinely hands over a PDF as an empty
 * string or application/octet-stream. Uploading that verbatim would be
 * rejected by the bucket for a file that is genuinely a PDF, so the type is
 * normalised - but only after the signature check below has passed.
 */
export const PDF_CONTENT_TYPE = "application/pdf";

/**
 * Types that may accompany a genuine PDF. Anything else is a device telling us
 * confidently that this is something other than a PDF.
 *
 * Only consulted when the first bytes could not be read; where a signature is
 * available it decides, because it is evidence and a MIME string is hearsay.
 */
const TOLERATED_TYPES = new Set([
  "",
  "application/pdf",
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-pdf",
]);

/** `%PDF-`, the first five bytes of every PDF since 1993. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** How many bytes the uploader needs to read to check the signature. */
export const PDF_SIGNATURE_BYTES = PDF_SIGNATURE.length;

export function hasPdfExtension(filename: string): boolean {
  return /\.pdf$/i.test(filename.trim());
}

export function hasPdfSignature(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export type DocumentFileCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether this file may be uploaded.
 *
 * `signature` is the file's first few bytes where the browser could read them,
 * and null where it could not. When it is present it is the deciding evidence:
 * a file whose bytes do not begin `%PDF-` is refused however it is named and
 * whatever type the device claimed. When it is absent the check falls back to
 * the name and the declared type, which is the best available and is why the
 * tolerated set exists.
 */
export function checkDocumentFile(
  file: { name: string; size: number; type: string },
  signature: ArrayLike<number> | null,
): DocumentFileCheck {
  if (!hasPdfExtension(file.name)) {
    return { ok: false, reason: `${file.name} is not a PDF. Only PDFs can be attached.` };
  }

  if (file.size === 0) {
    return { ok: false, reason: `${file.name} is empty.` };
  }

  if (file.size > DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: `${file.name} is larger than 25 MB. Split it, or upload a reduced copy.`,
    };
  }

  if (signature) {
    return hasPdfSignature(signature)
      ? { ok: true }
      : {
          ok: false,
          reason: `${file.name} is named like a PDF but its contents are not a PDF.`,
        };
  }

  // The bytes could not be read. The declared type is all that is left, and a
  // device that names another format is believed.
  if (!TOLERATED_TYPES.has(file.type.trim().toLowerCase())) {
    return { ok: false, reason: `${file.name} does not look like a PDF (${file.type}).` };
  }

  return { ok: true };
}

/**
 * One sentence about a batch, for the person holding the iPad.
 *
 * Silence after a failed upload is what makes people tap the button again, so
 * something is always said - and the first specific reason is quoted rather
 * than a count, because "1 file was skipped" does not tell anybody what to do
 * next.
 */
export function describeUploadOutcome(input: {
  uploaded: number;
  failures: readonly string[];
}): string | null {
  const { uploaded, failures } = input;
  if (failures.length === 0) return null;
  if (uploaded === 0) return `Nothing uploaded. ${failures[0]}`;
  const others = failures.length > 1 ? ` (${failures.length - 1} more had problems.)` : "";
  return `${uploaded} uploaded. ${failures[0]}${others}`;
}
