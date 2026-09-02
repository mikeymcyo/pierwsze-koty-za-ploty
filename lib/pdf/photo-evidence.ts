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

/**
 * The photographs as the AI is given them, numbered exactly as they print.
 *
 * The same function that numbers the plates in the PDF numbers them here, from
 * the same array in the same order, so a reference the model writes resolves
 * to the plate the reader is looking at. Two numbering schemes would be worse
 * than none: a citation that points at the wrong photograph is a false
 * statement about evidence, and nobody checks it.
 *
 * A photograph with no caption and no status still gets a line. The model has
 * to know P14 exists, or it will cite P13 for something P14 shows.
 */
export function photoManifest(
  items: { caption: string | null; status: string | null }[],
): string {
  return items
    .map((label, index) => {
      const item = photoEvidence(label, index);
      // The stage is printed only where somebody chose one. An invented
      // BEFORE/AFTER is a claim about when the picture was taken.
      const stage = item.status ? item.status.toUpperCase() : "—";
      return `${item.reference} | ${stage} | ${item.caption ?? "no caption"}`;
    })
    .join("\n");
}

/** Every plate reference in a piece of text, as written. */
export function plateReferencesIn(text: string): string[] {
  return [...text.matchAll(/\bP\d{2,3}\b/g)].map((match) => match[0]);
}

/**
 * The plate references that actually exist, given how many plates there are.
 *
 * Presentation-derived, so this is arithmetic rather than a lookup: P01 up to
 * the count, and nothing else.
 */
export function knownPlates(count: number): Set<string> {
  const plates = new Set<string>();
  for (let index = 0; index < count; index += 1) plates.add(photoReference(index));
  return plates;
}

/**
 * Removes plate references that point at no photograph.
 *
 * The model is told to cite only real plates; this is what makes that true.
 * A reference to P22 in a report with twenty-one photographs is not a small
 * formatting slip - it is a claim that evidence exists when it does not, and
 * it is exactly the kind of thing a reader takes on trust.
 *
 * The surrounding sentence is kept. The claim may still be sound; it is the
 * citation that was wrong, and deleting the sentence would lose a fact the
 * evidence might well support.
 */
export function stripUnknownPlates(text: string, count: number): string {
  const known = knownPlates(count);
  return (
    text
      // "(P22)" or "(P15, P22)" - drop the unknown, keep the rest.
      .replace(/\(([^()]*\bP\d{2,3}\b[^()]*)\)/g, (whole, inner: string) => {
        const kept = inner
          .split(/[,;]\s*/)
          .filter((part) => {
            const refs = plateReferencesIn(part);
            return refs.length === 0 || refs.every((ref) => known.has(ref));
          })
          .join(", ")
          .trim();
        return kept ? `(${kept})` : "";
      })
      // A bare "P22" outside brackets, and any double space it leaves behind.
      .replace(/\bP\d{2,3}\b/g, (ref) => (known.has(ref) ? ref : ""))
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:])/g, "$1")
      .trim()
  );
}
