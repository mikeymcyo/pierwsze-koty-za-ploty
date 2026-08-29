/**
 * Photographic evidence: how a picture is referred to, and what is printed
 * with it.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * A report that says "see the photograph of the hoarding" is useless the
 * moment there are two of them. Professional site records number their plates
 * and refer to the numbers, so this assigns P01, P02, P03 from the order the
 * photographs already appear in the report. The reference is presentation
 * only - it is derived from position at render time and stored nowhere, which
 * is what keeps it out of the database.
 *
 * It is stable for any given issued report because the issued PDF is written
 * once and never re-rendered: the order it was rendered from is the order
 * inside the file. Reopening and re-issuing writes a new file, and the
 * references are recomputed for it.
 */

/** The reference for the nth photograph, counting from zero. P01 ... P99, P100. */
export function photoReference(index: number): string {
  const n = Math.floor(index) + 1;
  return `P${n < 10 ? `0${n}` : String(n)}`;
}

export type PhotoEvidenceItem = {
  /** P01, P02 ... derived from position, never stored. */
  reference: string;
  /** The words somebody standing there wrote, or an accepted description. */
  caption: string | null;
  /** Before, During, After ... or null where it would only be noise. */
  status: string | null;
};

/**
 * What to print for one photograph.
 *
 * The caption leads because it is the only part written by a person who was
 * there; the status is metadata beside the reference. Nothing is invented: a
 * photograph with no caption prints its reference and its status and stops.
 *
 * `label` is `photoPrintLabel` from lib/photo-captions, passed in rather than
 * imported so this module stays free of the category vocabulary. Descriptions
 * are read as already stored - no model is called at render time, and none can
 * be: this function takes strings.
 */
export function photoEvidence(
  label: { caption: string | null; status: string | null },
  index: number,
): PhotoEvidenceItem {
  return {
    reference: photoReference(index),
    caption: label.caption?.trim() || null,
    status: label.status?.trim() || null,
  };
}

/** The reference and status as one line: "P03 · BEFORE". */
export function photoEvidenceHeading(item: PhotoEvidenceItem): string {
  return item.status ? `${item.reference} · ${item.status.toUpperCase()}` : item.reference;
}
