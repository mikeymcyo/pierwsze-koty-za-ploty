/**
 * "Built from Daily Reports 001, 002" - one line, near the top.
 *
 * A source-based Progress Report opened with empty writing boxes and a button
 * reading "Write from evidence". A site manager who had just ticked two Daily
 * Reports read that as: the reports are gone, and I have to type the job again.
 * They had not gone anywhere - the evidence had been frozen onto the report at
 * creation - but nothing on the screen said so.
 *
 * So the screen says so, in the fewest words that carry it. Not a panel, not a
 * table: one line a thumb scrolls past in half a second and a worried person
 * stops on.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node.
 */

export type SourceCounts = {
  /** Report numbers of the Daily Reports fed to the writer, in order. */
  daily: readonly number[];
  /** Report numbers of the issued Progress Reports consolidated. */
  progress: readonly number[];
  /**
   * Daily Reports recorded beneath a consolidated Progress Report. They are
   * provenance and are deliberately not fed to the writer a second time, so
   * they are counted rather than named.
   */
  viaDaily?: number;
};

/** "001", the same three-digit form the documents use. */
function pad(value: number): string {
  return String(value).padStart(3, "0");
}

/**
 * Numbers, joined the way somebody would say them.
 *
 * Beyond four the list becomes noise, so it says how many instead - a Progress
 * Report consolidating a month of dailies should not print twenty numbers in a
 * line meant to reassure.
 */
function listOf(numbers: readonly number[], singular: string, plural: string): string | null {
  if (numbers.length === 0) return null;
  if (numbers.length > 4) return `${numbers.length} ${plural}`;
  const padded = numbers.map(pad);
  const last = padded[padded.length - 1]!;
  const head = padded.slice(0, -1);
  const names = head.length > 0 ? `${head.join(", ")} and ${last}` : last;
  return `${numbers.length === 1 ? singular : plural} ${names}`;
}

/**
 * The line itself, or null where there is nothing to say.
 *
 * Null on a report written directly: it has no sources and must never imply
 * any. The screen says what that report is elsewhere, in its own words - see
 * describeProvenance in lib/summary-reports/provenance.ts.
 */
export function describeSourceLine(counts: SourceCounts): string | null {
  const parts = [
    listOf(counts.progress, "Progress Report", "Progress Reports"),
    listOf(counts.daily, "Daily Report", "Daily Reports"),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) return null;

  const via =
    counts.viaDaily && counts.viaDaily > 0
      ? ` (and ${counts.viaDaily} Daily Report${counts.viaDaily === 1 ? "" : "s"} beneath ${
          counts.progress.length === 1 ? "it" : "them"
        }, kept as provenance)`
      : "";

  return `Built from ${parts.join(", plus ")}${via}`;
}

/**
 * What the button says.
 *
 * Named, and counted: "Generate from 2 Daily Reports" tells somebody what is
 * about to happen to which reports. "Write from evidence" told them nothing,
 * and on a screen of empty boxes read like an instruction to start writing.
 */
export function generateLabel(counts: SourceCounts, hasContent: boolean): string {
  const verb = hasContent ? "Regenerate" : "Generate";
  const total = counts.daily.length + counts.progress.length;
  if (total === 0) return hasContent ? "Regenerate from what you recorded" : "Write from what you recorded";

  const parts = [
    counts.progress.length > 0
      ? `${counts.progress.length} Progress Report${counts.progress.length === 1 ? "" : "s"}`
      : null,
    counts.daily.length > 0
      ? `${counts.daily.length} Daily Report${counts.daily.length === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => part !== null);

  return `${verb} from ${parts.join(" and ")}`;
}

/** The line under the button, saying plainly that typing is not required. */
export const CONSOLIDATION_HELPER =
  "SiteBoss will consolidate the selected reports into this one. Add your own notes only if you want to provide extra context.";
