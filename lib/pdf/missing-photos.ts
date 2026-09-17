/**
 * A photograph the PDF needs and could not read is a reason to stop, not a
 * gap to print around.
 *
 * Finalising downloads every linked photograph and used to leave out any that
 * did not come back, then issue the file anyway. A storage blip at the moment
 * somebody pressed the button produced a client-facing record with evidence
 * missing and nothing to say so. Now the count and the plates are named, and
 * nothing is finalised.
 *
 * Pure, no runtime imports.
 */

export type PhotoToPrint = { id: string; caption: string | null };

/** The plates that did not come back, in print order. */
export function missingPhotos<T extends PhotoToPrint>(
  rows: readonly T[],
  loaded: (row: T) => boolean,
): { index: number; row: T }[] {
  const missing: { index: number; row: T }[] = [];
  rows.forEach((row, index) => {
    if (!loaded(row)) missing.push({ index, row });
  });
  return missing;
}

/** What the screen says. `reference(index)` is the plate label the PDF would print, P01 and so on. */
export function describeMissingPhotos(
  missing: readonly { index: number; row: PhotoToPrint }[],
  total: number,
  reference: (index: number) => string,
): string {
  const named = missing.slice(0, 5).map(({ index, row }) => {
    const caption = row.caption?.trim();
    return caption ? `${reference(index)} (${caption.slice(0, 40)}${caption.length > 40 ? "…" : ""})` : reference(index);
  });
  const more = missing.length > named.length ? ` and ${missing.length - named.length} more` : "";
  const count = `${missing.length} of ${total} photograph${total === 1 ? "" : "s"}`;
  return `${count} could not be loaded from storage (${named.join(", ")}${more}). Nothing has been finalised - the issued PDF must carry every photograph. Check the signal and try again; if it keeps failing, open the photograph on the report to see whether it is still there.`;
}
