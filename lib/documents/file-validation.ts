/**
 * Whether a chosen file is really a PDF, a JPEG or a PNG.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a browser and read the same way from the uploader, the PDF
 * package and their tests.
 *
 * ## Why there is no `accept` attribute
 *
 * Not because one broke anything. An earlier iPad test appeared to show the
 * Files browser greying out genuine PDFs, and the attribute was narrowed and
 * then removed chasing it. The owner later found the fault was his own: he had
 * been using a different file control altogether, and the Supporting Documents
 * uploader had been working the whole time. There was never an iOS bug here,
 * and nobody should go looking for one.
 *
 * The attribute stayed off because by then it was earning nothing. A picker's
 * `accept` was only ever a filter on what is easy to tap - the Files browser
 * lets a determined tap through regardless, and nothing downstream ever
 * trusted it. Adding one back is a small UX nicety on desktop, not a
 * correctness change either way.
 *
 * ## What actually enforces the allowed kinds
 *
 * The check below, which is stricter than any attribute could be: the name
 * must end `.pdf`, `.jpg`, `.jpeg` or `.png`, the file must be non-empty and
 * within the bucket's limit, and its first bytes must actually be that
 * format's signature. A photograph renamed `.pdf` is refused even when the
 * device claims `application/pdf`; so is a PDF renamed `.jpg`. The bucket
 * allows exactly these three types besides, and the upload's content type is
 * set from the kind decided here rather than from what the device said - iOS
 * routinely hands over a genuine PDF as an empty string or
 * `application/octet-stream`, and uploading that verbatim would have the
 * bucket reject a perfectly good file.
 *
 * ## Why JPEG and PNG, and not HEIC
 *
 * A site manager photographs a delivery note or a signed permit as often as
 * he is handed a PDF of one, and that photograph is a supporting document
 * like any other. JPEG and PNG can be placed on an A4 page of the issued PDF
 * without any decoding on the server (pdf-lib embeds both natively), so they
 * are accepted. HEIC cannot be embedded in a PDF without converting it first,
 * and nothing on the server does that, so a HEIC is refused with a message
 * saying to send it as a JPEG instead. Sharing from Photos on an iPhone
 * hands over a JPEG in any case.
 *
 * Because a refused file is refused after the tap rather than greyed out
 * before it, the refusal has to be worth reading. That is what
 * checkDocumentFile returns.
 */

/** Matches the project-documents bucket's own limit. */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export type DocumentKind = "pdf" | "jpeg" | "png";

/**
 * What the object is stored as, whatever the device called it.
 *
 * Kept as a named constant because the uploader, the merger and the tests all
 * compare against it. The bucket's allow-list is exactly these three values.
 */
export const PDF_CONTENT_TYPE = "application/pdf";

export const DOCUMENT_CONTENT_TYPES: Record<DocumentKind, string> = {
  pdf: PDF_CONTENT_TYPE,
  jpeg: "image/jpeg",
  png: "image/png",
};

/** What the stored object's name ends with, from the kind rather than the device's name. */
export const DOCUMENT_EXTENSIONS: Record<DocumentKind, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
};

/**
 * Types that may accompany a genuine file of each kind. Anything else is a
 * device telling us confidently that this is something other than it is.
 *
 * Only consulted when the first bytes could not be read; where a signature is
 * available it decides, because it is evidence and a MIME string is hearsay.
 */
const TOLERATED_TYPES: Record<DocumentKind, ReadonlySet<string>> = {
  pdf: new Set(["", "application/pdf", "application/octet-stream", "binary/octet-stream", "application/x-pdf"]),
  jpeg: new Set(["", "image/jpeg", "image/jpg", "image/pjpeg", "application/octet-stream", "binary/octet-stream"]),
  png: new Set(["", "image/png", "image/x-png", "application/octet-stream", "binary/octet-stream"]),
};

/** `%PDF-`, the first five bytes of every PDF since 1993. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** `FF D8 FF`, the start-of-image marker every JPEG opens with. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** The eight-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** How many bytes the uploader needs to read to check any signature. */
export const PDF_SIGNATURE_BYTES = PDF_SIGNATURE.length;
export const DOCUMENT_SIGNATURE_BYTES = PNG_SIGNATURE.length;

function startsWith(bytes: ArrayLike<number>, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

export function hasPdfSignature(bytes: ArrayLike<number>): boolean {
  return startsWith(bytes, PDF_SIGNATURE);
}

/**
 * What the bytes say the file is, or null when they say none of the three.
 *
 * Decided from the bytes alone, never from a name or a declared type, so the
 * same answer is reached in the browser before an upload and on the server
 * when an old object is read back with no recorded type at all.
 */
export function documentKindFromBytes(bytes: ArrayLike<number>): DocumentKind | null {
  if (startsWith(bytes, PDF_SIGNATURE)) return "pdf";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  return null;
}

/** The kind a filename claims, from its extension, or null for anything else. */
export function documentKindFromFilename(filename: string): DocumentKind | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  switch (match?.[1]?.toLowerCase()) {
    case "pdf":
      return "pdf";
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "png":
      return "png";
    default:
      return null;
  }
}

export function hasPdfExtension(filename: string): boolean {
  return documentKindFromFilename(filename) === "pdf";
}

/** Whether a recorded MIME type names something the text extractor can read. */
export function isPdfContentType(mimeType: string | null | undefined): boolean {
  return (mimeType ?? "").trim().toLowerCase() === PDF_CONTENT_TYPE;
}

export type DocumentFileCheck =
  | { ok: true; kind: DocumentKind; contentType: string; extension: string }
  | { ok: false; reason: string };

const KIND_LABEL: Record<DocumentKind, string> = { pdf: "a PDF", jpeg: "a JPEG", png: "a PNG" };

/**
 * Whether this file may be uploaded, and as what.
 *
 * `signature` is the file's first few bytes where the browser could read them,
 * and null where it could not. When it is present it is the deciding evidence:
 * a file whose bytes do not match the format its name claims is refused
 * however it is named and whatever type the device claimed. When it is absent
 * the check falls back to the name and the declared type, which is the best
 * available and is why the tolerated set exists.
 */
export function checkDocumentFile(
  file: { name: string; size: number; type: string },
  signature: ArrayLike<number> | null,
): DocumentFileCheck {
  const kind = documentKindFromFilename(file.name);
  if (!kind) {
    const heic = /\.hei[cf]$/i.test(file.name.trim());
    return {
      ok: false,
      reason: heic
        ? `${file.name} is a HEIC photo, which cannot be placed in a PDF. Share it as a JPEG instead.`
        : `${file.name} is not a PDF, JPEG or PNG. Only those can be attached.`,
    };
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

  const accepted = {
    ok: true as const,
    kind,
    contentType: DOCUMENT_CONTENT_TYPES[kind],
    extension: DOCUMENT_EXTENSIONS[kind],
  };

  if (signature) {
    const actual = documentKindFromBytes(signature);
    if (actual === kind) return accepted;
    return {
      ok: false,
      reason:
        actual === null
          ? `${file.name} is named like ${KIND_LABEL[kind]} but its contents are not ${KIND_LABEL[kind]}.`
          : `${file.name} is named like ${KIND_LABEL[kind]} but it is actually ${KIND_LABEL[actual]}. Rename it and try again.`,
    };
  }

  // The bytes could not be read. The declared type is all that is left, and a
  // device that names another format is believed.
  if (!TOLERATED_TYPES[kind].has(file.type.trim().toLowerCase())) {
    return {
      ok: false,
      reason: `${file.name} does not look like ${KIND_LABEL[kind]} (${file.type}).`,
    };
  }

  return accepted;
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
