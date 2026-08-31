/**
 * Choosing which Daily Reports a Progress Report is built from.
 *
 * A Progress Report used to take every issued Daily Report inside a date range.
 * That is a guess dressed as a decision: a fortnight's report is not always a
 * fortnight of dates, a site manager may want the three days that mattered, and
 * a range silently swept in a report somebody had already consolidated
 * elsewhere. The reports are now picked one at a time, and this module owns
 * what that means.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node without a database.
 */

/** One issued Daily Report, as the picker sees it. */
export type SelectableDaily = {
  id: string;
  /** The per-project sequential number. */
  number: number;
  /** The day the work was done, `YYYY-MM-DD`. */
  date: string;
  /** When it was issued, as an ISO instant, or null on a report issued before that was recorded. */
  issuedAt: string | null;
  /**
   * The number of an issued Progress Report that already consolidates this
   * daily, or null. Not a prohibition - a report may legitimately be used
   * twice, and saying so is more useful than hiding it.
   */
  usedIn: number | null;
};

/**
 * What is ticked when the picker opens.
 *
 * Everything not already consolidated into an issued Progress Report, which is
 * the sensible reading of "what has happened since the last one went out". It
 * is a starting point and nothing more: every box can be ticked or cleared, and
 * a report already used stays on the list, unticked, with its Progress Report
 * named - hiding it would be its own kind of lie.
 *
 * Where every daily has already been consolidated, nothing is preselected
 * rather than everything: repeating a whole period should be a decision
 * somebody makes on purpose.
 */
export function defaultDailySelection(dailies: readonly SelectableDaily[]): string[] {
  return dailies.filter((daily) => daily.usedIn === null).map((daily) => daily.id);
}

/**
 * The ids that will actually be written, in the order the reports were issued.
 *
 * Deduplicated, and filtered to reports that really are on this project and
 * really are issued - the form is a suggestion, not an authority. This is what
 * makes "no duplicate source rows" a property of the write rather than of the
 * user interface.
 */
export function resolveDailySelection(
  requested: readonly string[],
  available: readonly SelectableDaily[],
): SelectableDaily[] {
  const wanted = new Set(requested);
  return available.filter((daily) => wanted.has(daily.id));
}

/**
 * The period the selected reports actually cover.
 *
 * Used only where the author left the dates blank. A report that says
 * "1 to 14 August" having consolidated three days in that fortnight is telling
 * the reader something untrue about its own coverage; the span of what was
 * chosen is the honest default. An author who types dates keeps them.
 */
export function selectedPeriod(
  selected: readonly SelectableDaily[],
): { start: string; end: string } | null {
  if (selected.length === 0) return null;
  const dates = selected.map((daily) => daily.date).sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}

/** How many of the offered reports have already been consolidated elsewhere. */
export function alreadyConsolidated(dailies: readonly SelectableDaily[]): SelectableDaily[] {
  return dailies.filter((daily) => daily.usedIn !== null);
}
