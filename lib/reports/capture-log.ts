/**
 * The day's capture log: several dictations, one Daily Report.
 *
 * Site Capture is used across a working day. Somebody speaks at 08:00, walks
 * away, comes back at 10:30, again at 14:00. Every one of those is an addition
 * to the same Daily Report - never a replacement of what came before, and never
 * a second report for the same day.
 *
 * ## Why the log lives in reports.raw_notes
 *
 * `raw_notes` already means "what the user actually said, kept word for word".
 * It is the source the Cleanup AI reads, it is shown back on screen under "What
 * you actually said", and it is never overwritten by drafting. A capture is
 * exactly that: more of what the user actually said. Storing captures anywhere
 * else would mean a second source of truth for the same sentence, and a
 * migration to hold it.
 *
 * `report_sections` could not hold them: it is `unique (report_id,
 * section_type)`, one row per section, so it has nowhere to put a fourth
 * dictation of the day. That constraint is what makes this a text format rather
 * than a table.
 *
 * ## The format
 *
 *   [08:14] Poured the slab in the north bay, two loads in.
 *
 *   [10:32] Steel delivery arrived, offloaded to the compound.
 *
 * A line beginning `[HH:MM]` starts a new entry. Everything else belongs to the
 * entry above it. That is the whole grammar.
 *
 * Three properties matter more than the syntax:
 *
 * 1. **Appending never rewrites.** `appendCapture` returns the previous text
 *    unchanged with the new entry after it - not a re-serialised log. There is
 *    no parse-then-write round trip that could lose a character somebody spoke.
 * 2. **Editing cannot lose anything.** These markers are informational. Delete
 *    one, mistype one, or write `[08:14]` by hand and the only effect is where
 *    the on-screen list draws a boundary. No text moves, no text vanishes, and
 *    nothing changes which section it ends up in - unlike a heading, a marker
 *    here carries no status. Notes written before Site Capture existed have no
 *    markers at all and read as one untimed entry.
 * 3. **The times never reach the client.** `raw_notes` is not printed in the
 *    PDF - it is an on-screen record and an AI source. So the chronology is
 *    kept internally, exactly as asked, and the issued document stays a report
 *    rather than a timeline.
 *
 * No runtime imports and no path aliases, so a test can load this straight into
 * Node - the same rule as lib/report-structure.ts and lib/photos-rotation.ts.
 */

/** One capture. `at` is null for text written before any marker. */
export type CaptureEntry = {
  /** Local clock time the capture was saved, `HH:MM`, or null if untimed. */
  at: string | null;
  text: string;
};

/**
 * A line that opens a new entry.
 *
 * Anchored and bounded: only a real 24-hour clock time in square brackets at
 * the very start of a line counts, so `[12]`, `[8:14]`, `[25:00]` and a bracket
 * mid-sentence are all ordinary text.
 */
const MARKER = /^\[([01]\d|2[0-3]):([0-5]\d)\][ \t]*/;

/** Whether a string is a clock time this module will write into the log. */
export function isCaptureTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/**
 * Reads the log back out.
 *
 * Deliberately total: every input produces a sensible answer and nothing
 * throws. Text with no markers is one untimed entry, which is what every report
 * written before Site Capture looks like.
 */
export function parseCaptureLog(rawNotes: string | null | undefined): CaptureEntry[] {
  const text = typeof rawNotes === "string" ? rawNotes : "";
  if (!text.trim()) return [];

  const entries: CaptureEntry[] = [];
  let current: { at: string | null; lines: string[] } | null = null;

  for (const line of text.split("\n")) {
    const marker = MARKER.exec(line);
    if (marker) {
      if (current) entries.push({ at: current.at, text: current.lines.join("\n").trim() });
      current = { at: `${marker[1]}:${marker[2]}`, lines: [line.slice(marker[0].length)] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { at: null, lines: [line] };
    }
  }
  if (current) entries.push({ at: current.at, text: current.lines.join("\n").trim() });

  // An entry whose text is empty was a marker somebody left behind. It is not a
  // capture, so it is not listed - but nothing is deleted from raw_notes for it.
  return entries.filter((entry) => entry.text.length > 0);
}

/**
 * Adds one capture to the end of the log.
 *
 * The previous text is returned verbatim with the new entry after it: the
 * result always begins with everything that was already there, which is the
 * property that makes "do not overwrite previous notes" structural rather than
 * a matter of care. A blank capture is refused by returning the log unchanged.
 */
export function appendCapture(
  rawNotes: string | null | undefined,
  text: string,
  at?: string | null,
): string {
  const previous = typeof rawNotes === "string" ? rawNotes : "";
  const addition = text.replace(/\s+$/, "").replace(/^\s+/, "");
  if (!addition) return previous;

  const entry = isCaptureTime(at) ? `[${at}] ${addition}` : addition;
  // Trailing whitespace only - never a character somebody typed.
  const head = previous.replace(/\s+$/, "");
  return head ? `${head}\n\n${entry}` : entry;
}

/** How many captures the log holds. */
export function captureCount(rawNotes: string | null | undefined): number {
  return parseCaptureLog(rawNotes).length;
}

/**
 * What the capture screen says about the day so far.
 *
 * Times come from the entries themselves, so a log with no markers says nothing
 * about timing rather than inventing a span.
 */
export function captureSpan(entries: CaptureEntry[]): { first: string; last: string } | null {
  const times = entries.flatMap((entry) => (entry.at ? [entry.at] : []));
  if (times.length === 0) return null;
  return { first: times[0]!, last: times[times.length - 1]! };
}

/** A short one-line preview of a capture, for a list that must not become a wall of text. */
export function capturePreview(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Whether this capture is already the last thing in the log.
 *
 * A site manager on one bar of signal taps Save, sees nothing happen, and taps
 * it again. Without this the second tap appends the same sentence twice and the
 * day's record reads as though he said it twice.
 *
 * Compared on the exact entry the append would write, so it catches the retry
 * and nothing else: the same words genuinely said again ten minutes later carry
 * a different clock time and are a different entry, which is right - somebody
 * repeating themselves on site is a fact about the day.
 */
export function alreadyEnded(
  rawNotes: string | null | undefined,
  text: string,
  at?: string | null,
): boolean {
  const previous = typeof rawNotes === "string" ? rawNotes : "";
  const addition = text.trim();
  if (!addition || !previous.trim()) return false;
  const entry = isCaptureTime(at) ? `[${at}] ${addition}` : addition;
  return previous.replace(/\s+$/, "").endsWith(entry);
}
