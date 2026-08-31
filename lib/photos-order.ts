/**
 * The order photographs are printed in.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a database and read the same way from the screen and the
 * action that saves them.
 *
 * ## Why it is a decision and not an accident
 *
 * Plates are numbered from their position - P01, P02, P03 - and a report is
 * read in the order they appear. So the order is part of what the document
 * says: a before and an after that land on the same row read as a pair, and
 * the same two photographs three plates apart read as two unrelated pictures.
 * Until now that order was whatever the upload queue happened to produce.
 *
 * ## What it is not
 *
 * Reordering moves nothing and copies nothing. `photos.sort_order` is the only
 * column it writes; the stored objects, the captions, the statuses and the AI
 * descriptions all stay attached to the row they belong to, because the row is
 * what moves. An issued report is not reordered at all - its PDF was written
 * once and the order inside that file is the order it was issued in.
 */

/**
 * Every photograph uploaded so far carries `sort_order = 0`, and the lists
 * fall back to `created_at`. So a report nobody has reordered is in upload
 * order, and must stay that way until somebody says otherwise: positions are
 * written only when a move is actually made.
 */
export const UNORDERED = 0;

/**
 * Move one photograph to a new position.
 *
 * Returns the ids in their new order, or the list unchanged when the move
 * would go off either end - a Left button on the first plate does nothing
 * rather than wrapping it round to the back, which on a phone is what an
 * accidental tap deserves.
 */
export function movePhoto(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  if (to < 0 || to >= ids.length || to === from) return [...ids];

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** One step towards the front of the report, or nothing at the front. */
export function movePhotoEarlier(ids: readonly string[], id: string): string[] {
  return movePhoto(ids, id, ids.indexOf(id) - 1);
}

/** One step towards the back. */
export function movePhotoLater(ids: readonly string[], id: string): string[] {
  return movePhoto(ids, id, ids.indexOf(id) + 1);
}

/**
 * The positions to store for an ordered list of ids.
 *
 * One-based, so that a saved order is always distinguishable from the
 * never-ordered `0` that every existing row carries - a photograph whose
 * position happened to be written as 0 would sort against the unordered ones
 * by upload time instead of where it was put.
 */
export function sortOrderValues(ids: readonly string[]): { id: string; sortOrder: number }[] {
  return ids.map((id, index) => ({ id, sortOrder: index + 1 }));
}

/**
 * Whether a submitted order is the same set as the report actually holds.
 *
 * The order arrives from a browser, so it is checked against what the database
 * says rather than trusted: a list that is missing a photograph would leave it
 * behind at position zero, and one carrying an extra id would be an attempt to
 * write a row on another report.
 */
export function isSameSet(submitted: readonly string[], actual: readonly string[]): boolean {
  if (submitted.length !== actual.length) return false;
  const seen = new Set(actual);
  const used = new Set<string>();
  for (const id of submitted) {
    if (!seen.has(id) || used.has(id)) return false;
    used.add(id);
  }
  return true;
}

/**
 * Whether two photographs will print side by side.
 *
 * The PDF lays plates two to a row in the order given, so a pair is together
 * when the earlier one sits on an even index. The screen says so, because
 * "put the before and the after next to each other" is the whole reason
 * somebody reorders a report, and a rule they cannot see is a rule they have
 * to discover by issuing the document.
 */
export const PLATES_PER_ROW = 2;

export function sharesRow(indexA: number, indexB: number): boolean {
  return Math.floor(indexA / PLATES_PER_ROW) === Math.floor(indexB / PLATES_PER_ROW);
}
