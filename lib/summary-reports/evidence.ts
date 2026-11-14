/**
 * The textual evidence a consolidated report is written from.
 *
 * This is the plumbing between a Daily Report and the Progress Report above it,
 * and between a Progress Report and the Completion Report above that. It used
 * to live inside the "use server" action, which meant nothing could test it and
 * nobody could see what it produced - so when a Progress Report came back empty
 * from two rich Daily Reports there was no way to tell whether the words had
 * reached the model at all.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node and asserts on the actual text.
 *
 * ## Three rules it exists to get right
 *
 * 1. **A block with no content is not a block.** A heading alone -
 *    "FINAL DAILY REPORT 001 - 2026-08-31" and nothing under it - used to be
 *    pushed anyway. That made the evidence non-empty, so the "nothing to work
 *    from" guard never fired; the model was handed a list of headings and
 *    returned empty sections, and the user was told the evidence supported no
 *    sections rather than that the reports were empty.
 * 2. **Raw notes fill gaps, they do not duplicate.** A Daily Report's written
 *    sections are the account of that day. Its `raw_notes` are what was
 *    dictated, and are usually the same facts in rougher words - sending both
 *    tells the consolidator the same thing twice, and duplication is the fault
 *    it is least good at recovering from. But a site manager who drafted at
 *    lunchtime and captured three more entries at four o'clock has facts in
 *    the notes that the sections never saw, and losing those is worse. So the
 *    notes are included only where they carry material the sections do not.
 * 3. **A covered day is not evidence twice.** A Daily Report consolidated into
 *    a Progress Report that a Completion Report is using is provenance, not
 *    evidence. The caller filters those out before it gets here; what this
 *    module guarantees is that nothing re-introduces them.
 */

/** One written section of a source report, already labelled for a reader. */
export type EvidenceSection = { label: string; content: string | null };

export type DailyEvidence = {
  number: number;
  date: string;
  sections: readonly EvidenceSection[];
  /** Everything said on site that day, verbatim. See rule 2. */
  rawNotes: string | null;
  workforce: readonly string[];
  plant: readonly string[];
};

export type ProgressEvidence = {
  number: number;
  title: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  sections: readonly EvidenceSection[];
};

const has = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** The written sections of one report, one per line, or null if it wrote none. */
export function sectionLines(sections: readonly EvidenceSection[]): string | null {
  const written = sections
    .filter((section) => has(section.content))
    .map((section) => `${section.label}: ${section.content!.trim()}`);
  return written.length > 0 ? written.join("\n") : null;
}

/**
 * Words worth comparing when deciding whether raw notes say anything new.
 *
 * Long-ish words only, lowercased, punctuation stripped. Short words are the
 * grammar that changes completely between a dictated sentence and its written
 * form; the nouns, materials, places and numbers are what actually carry a
 * fact, and those survive the rewrite.
 */
function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 || /\d/.test(word));
  return new Set(words);
}

/**
 * How much of the raw notes the written sections do not account for, 0 to 1.
 *
 * Exported because the threshold is a judgement and a test should be able to
 * show where it sits rather than only that it fired.
 */
export function unrepresentedShare(
  rawNotes: string | null | undefined,
  sections: readonly EvidenceSection[],
): number {
  if (!has(rawNotes)) return 0;
  const spoken = significantWords(rawNotes);
  if (spoken.size === 0) return 0;
  const written = significantWords(
    sections
      .filter((section) => has(section.content))
      .map((section) => section.content!)
      .join(" "),
  );
  let missing = 0;
  for (const word of spoken) if (!written.has(word)) missing += 1;
  return missing / spoken.size;
}

/**
 * The share of a day's spoken words that may be absent from its write-up before
 * the notes are sent as well.
 *
 * A quarter is deliberately generous towards keeping a fact. A faithful write-up
 * of the same day still drops a third of the dictated vocabulary - "erm", "so
 * then we", the repetitions - but it keeps the materials, the places and the
 * numbers, which is what this counts. A day where a quarter of the substantive
 * words never made it into any section has something in the notes the sections
 * never saw.
 */
export const RAW_NOTES_THRESHOLD = 0.25;

/**
 * The day's notes, where they carry something the written sections do not.
 *
 * Null where the sections already say it, so the consolidator is never handed
 * the same day twice in two voices. Null where there are no notes. And the
 * notes in full where the report was issued without any written sections at
 * all, which is a site manager who dictated and issued without drafting - the
 * notes are then the only account that exists.
 */
export function gapFillingNotes(
  rawNotes: string | null | undefined,
  sections: readonly EvidenceSection[],
): string | null {
  if (!has(rawNotes)) return null;
  if (!sectionLines(sections)) return rawNotes.trim();
  return unrepresentedShare(rawNotes, sections) >= RAW_NOTES_THRESHOLD ? rawNotes.trim() : null;
}

/**
 * One Daily Report as evidence, or null where it holds nothing at all.
 *
 * Null rather than a bare heading: see rule 1. A caller that pushes headings
 * for empty reports turns "these reports are empty" into "the model would not
 * write anything", which sends somebody looking in the wrong place.
 */
export function dailyEvidenceBlock(daily: DailyEvidence): string | null {
  const written = sectionLines(daily.sections);
  const notes = gapFillingNotes(daily.rawNotes, daily.sections);
  const workforce = daily.workforce.filter(has);
  const plant = daily.plant.filter(has);

  const body = [
    written,
    notes ? `${written ? "Also recorded on site that day" : "Recorded on site"}: ${notes}` : null,
    workforce.length ? `Recorded workforce: ${workforce.join("; ")}` : null,
    plant.length ? `Recorded plant: ${plant.join("; ")}` : null,
  ].filter(has);

  if (body.length === 0) return null;
  return [
    `FINAL DAILY REPORT ${String(daily.number).padStart(3, "0")} - ${daily.date}`,
    ...body,
  ].join("\n");
}

/** One issued Progress Report as evidence, or null where it wrote nothing. */
export function progressEvidenceBlock(progress: ProgressEvidence): string | null {
  const written = sectionLines(progress.sections);
  if (!written) return null;
  return [
    `ISSUED PROGRESS REPORT ${String(progress.number).padStart(3, "0")}`,
    progress.title ? `Title: ${progress.title}` : null,
    progress.periodStart && progress.periodEnd
      ? `Period: ${progress.periodStart} to ${progress.periodEnd}`
      : null,
    written,
  ]
    .filter(has)
    .join("\n");
}

export type EvidenceInput = {
  /** Issued Progress Reports this document consolidates, in issue order. */
  progress?: readonly ProgressEvidence[];
  /**
   * Daily Reports fed to the writer. The caller has already removed any that a
   * consolidated Progress Report above accounts for - those are provenance.
   */
  daily?: readonly DailyEvidence[];
  /** A standalone report's own written sections, which are its only evidence. */
  own?: readonly EvidenceSection[];
  /** The heading a standalone report's own sections are given. */
  ownHeading?: string;
  /** Captions of the photographs curated into this document. */
  photoCaptions?: readonly string[];
};

export type BuiltEvidence = {
  /** What the model is handed. Empty string where there is genuinely nothing. */
  text: string;
  /** How many source reports of each kind actually contributed words. */
  progressCount: number;
  dailyCount: number;
  /** Length of the written evidence, photographs excluded. Shown to the user. */
  characters: number;
};

/**
 * Everything the writer reads, assembled once.
 *
 * The counts come back with it so the screen can say what was consolidated.
 * "6 sections written from 2 Daily Reports" is checkable on a phone; a report
 * that silently came from nothing is not, and that is how a whole afternoon
 * went into finding out that the words never arrived.
 */
export function buildEvidence(input: EvidenceInput): BuiltEvidence {
  const progressBlocks = (input.progress ?? []).map(progressEvidenceBlock).filter(has);
  const dailyBlocks = (input.daily ?? []).map(dailyEvidenceBlock).filter(has);
  const ownBlock = input.own ? sectionLines(input.own) : null;
  const captions = (input.photoCaptions ?? []).filter(has);

  const written = [
    ...progressBlocks,
    ...dailyBlocks,
    ownBlock ? [input.ownHeading ?? "RECORDED FOR THIS PERIOD", ownBlock].join("\n") : null,
  ].filter(has);

  const text = [
    written.join("\n\n"),
    captions.length ? `CURATED PHOTOGRAPH CAPTIONS:\n${captions.join("\n")}` : null,
  ]
    .filter(has)
    .join("\n\n");

  return {
    text,
    progressCount: progressBlocks.length,
    dailyCount: dailyBlocks.length,
    characters: written.join("\n\n").length,
  };
}

/**
 * What to tell somebody whose consolidation found nothing to work from.
 *
 * Never "the evidence did not support any sections", which reads as a judgement
 * on their reports when it is usually a fact about them being empty.
 */
export function noEvidenceMessage(built: BuiltEvidence, sourceCount: number): string {
  if (sourceCount === 0) {
    return "Write some notes, or add captioned photographs, before drafting. There is nothing to work from yet.";
  }
  return `The ${sourceCount === 1 ? "report" : `${sourceCount} reports`} behind this one carry no written content - no drafted sections and no site notes. Open ${
    sourceCount === 1 ? "it" : "them"
  } and check the words were saved before they were issued.`;
}
