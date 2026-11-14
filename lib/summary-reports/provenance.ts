/**
 * Where a Progress Report's information came from - and, just as importantly,
 * where it did not.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested directly and used from a client component.
 *
 * There are two honest ways to write a consolidated report - a Progress Report
 * or a Completion Report - and the product had only ever supported one:
 *
 * - **From issued Daily Reports.** The report consolidates records that were
 *   already written and issued. Their list is frozen at creation and printed
 *   as the source record, so a client can trace every statement back.
 *
 * - **Written directly.** The site manager was not there. The work was
 *   reported by phone, by WhatsApp, by photographs sent at the end of the day;
 *   there are no Daily Reports and there is nothing to consolidate. The report
 *   is written from what they were told and what they were sent.
 *
 * The second is not a lesser version of the first and must never be dressed up
 * as it. A standalone report has no sources, prints no source record, and
 * nothing in it - not the prose, not the prompt that drafted it - may say or
 * imply that it came from Daily Reports. Provenance that does not exist cannot
 * be invented.
 *
 * That distinction needs no column: a report either has source rows or it does
 * not, and the absence is the fact. Hence no migration.
 */

export const SUMMARY_SOURCE_MODES = ["sources", "standalone"] as const;

export type SummarySourceMode = (typeof SUMMARY_SOURCE_MODES)[number];

/** What the create form asks for. Anything unrecognised keeps the old path. */
export function sourceModeOf(value: string | null | undefined): SummarySourceMode {
  return value === "standalone" ? "standalone" : "sources";
}

/**
 * Whether this report was written directly rather than consolidated.
 *
 * Read from the report itself: a consolidated report always has at least one
 * frozen source, so no sources means it never had any.
 */
export function isStandalone(sourceCount: number): boolean {
  return sourceCount === 0;
}

/**
 * The heading the evidence is given when it is handed to the model.
 *
 * Deliberately explicit about what the material is, because a block labelled
 * "issued source evidence" is how a model comes to write "as recorded in the
 * daily reports" about a report that has none.
 */
export function evidenceHeading(kind: string, standalone: boolean): string {
  if (!standalone) return "ISSUED SOURCE EVIDENCE:";
  if (kind === "survey") return "NOTES RECORDED ON THE VISIT:";
  return "INFORMATION RECORDED DIRECTLY FOR THIS PERIOD (there are no daily reports):";
}

/**
 * The instruction that keeps a standalone report honest about itself.
 *
 * Given to the model alongside the evidence, and worth its tokens: the system
 * prompt talks about consolidating issued records, and without this a model
 * happily writes "the daily reports record" over material that came off a
 * phone.
 */
export function provenanceInstruction(standalone: boolean): string | null {
  if (!standalone) return null;
  return [
    "THIS REPORT HAS NO SOURCE DAILY REPORTS.",
    "The information above was recorded directly by the site manager, from site updates, photographs and messages.",
    "Do not state or imply that it came from daily reports, issued records, or any document that is not named above.",
    "Do not refer to 'the source reports', 'the daily records' or 'the issued evidence'.",
  ].join("\n");
}

/** One line on the report screen, so it is obvious which kind of report this is. */
export function describeProvenance(kind: string, sourceCount: number): string {
  if (kind === "survey") return "Written from a site visit.";
  if (isStandalone(sourceCount)) {
    return "Written directly, from site information recorded here. This report has no Daily Reports behind it and does not claim any.";
  }
  return sourceCount === 1
    ? "Consolidated from 1 issued source report."
    : `Consolidated from ${sourceCount} issued source reports.`;
}

/** Said when somebody asks to consolidate a period that has nothing in it. */
export const NO_DAILY_REPORTS =
  "There are no final Daily Reports in that period. Choose \"Write it directly\" to produce the report from your own notes and photographs instead.";

/** The same answer for a Completion Report, which draws on Progress Reports too. */
export const NO_ISSUED_REPORTS =
  "There are no issued reports to build this Completion Report from. Choose \"Write it directly\" to produce it from your own notes, photographs and issues instead.";

/** Which of the two a document should say when it finds nothing to consolidate. */
export function noSourcesMessage(kind: string): string {
  return kind === "completion" ? NO_ISSUED_REPORTS : NO_DAILY_REPORTS;
}
