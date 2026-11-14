/**
 * Choosing which Progress Reports a Completion Report is built from.
 *
 * The sibling of lib/summary-reports/daily-selection.ts, and the same argument:
 * a Completion Report used to take every issued Progress Report whose period
 * fell inside a date range, which is a guess about what somebody meant rather
 * than a record of what they chose.
 *
 * ## Why a Progress Report is preferred over the days beneath it
 *
 * An issued Progress Report has already been consolidated, reviewed by a
 * person, and sent to a client. Its wording is the best account of that period
 * that exists, and the daily records underneath it are the raw material it was
 * made from. Feeding both to the writer would consolidate the same fortnight
 * twice, in two voices, and the report would say everything about it twice.
 *
 * So a daily covered by a selected Progress Report stays on the record as
 * provenance - `via` - and is never fed to the writer again. A daily that no
 * selected Progress Report covers is a real gap in the account, and is fed
 * directly. That is the whole rule.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node without a database.
 */

/** One issued Progress Report, as the picker sees it. */
export type SelectableProgress = {
  id: string;
  number: number;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  /** The Daily Reports this Progress Report consolidated. Its coverage. */
  dailyIds: readonly string[];
};

/**
 * What is ticked when the picker opens: all of them.
 *
 * A Completion Report is the record of a whole job, so every issued Progress
 * Report is normally part of it. Unlike the Daily picker there is no "already
 * used" to reason about - a Completion Report is written once, at the end.
 */
export function defaultProgressSelection(progress: readonly SelectableProgress[]): string[] {
  return progress.map((report) => report.id);
}

/**
 * The Progress Reports that will actually be written, in issue order.
 *
 * Intersected with what the database gave us, so a posted id that is not an
 * issued Progress Report on this project cannot become a source - and the
 * intersection deduplicates, so no source row can appear twice.
 */
export function resolveProgressSelection(
  requested: readonly string[],
  available: readonly SelectableProgress[],
): SelectableProgress[] {
  const wanted = new Set(requested);
  return available.filter((report) => wanted.has(report.id));
}

/** Every Daily Report the selected Progress Reports already account for. */
export function coveredDailyIds(selected: readonly SelectableProgress[]): Set<string> {
  const covered = new Set<string>();
  for (const report of selected) {
    for (const id of report.dailyIds) covered.add(id);
  }
  return covered;
}

/**
 * The Daily Reports that fill the gaps.
 *
 * Everything issued on the project that no selected Progress Report accounts
 * for. Deselecting a Progress Report therefore does not lose its period from
 * the record - the days it covered become direct evidence again, which is the
 * behaviour somebody deselecting it would expect.
 */
export function uncoveredDailyIds(
  dailyIds: readonly string[],
  selected: readonly SelectableProgress[],
): string[] {
  const covered = coveredDailyIds(selected);
  return Array.from(new Set(dailyIds)).filter((id) => !covered.has(id));
}

/** The span the selected Progress Reports state between them, where they state one. */
export function progressPeriod(
  selected: readonly SelectableProgress[],
): { start: string; end: string } | null {
  const starts = selected.flatMap((report) => (report.periodStart ? [report.periodStart] : []));
  const ends = selected.flatMap((report) => (report.periodEnd ? [report.periodEnd] : []));
  if (starts.length === 0 || ends.length === 0) return null;
  return { start: starts.sort()[0]!, end: ends.sort()[ends.length - 1]! };
}
