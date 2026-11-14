/**
 * What the job is supposed to be.
 *
 * Somebody is sent to Store 1848 to repair a leaking bakery sink and rectify
 * the warehouse doors. That is the job. It arrives as a sentence in a van at
 * seven in the morning, not as a purchase order - the PO may follow that
 * afternoon, the next week, or never. So a spoken or typed brief is valid job
 * context on its own, and a document that arrives later strengthens it rather
 * than replacing it.
 *
 * ## Where it lives, and why that needs no migration
 *
 * `projects.description` has existed since the first schema as free text about
 * the project. It is exactly the right column; what it lacked was chronology.
 * So the brief is an append-only log in it, the same grammar Site Capture uses
 * on `reports.raw_notes` - each entry opened by the moment it was added:
 *
 *   [2026-09-01 07:12] Attending to repair a leaking bakery sink and rectify
 *   the warehouse doors. Access may be difficult due to deliveries.
 *
 *   [2026-09-01 14:38] Job document added: Lidl PO 4501234567 (doc:8c5de434-…)
 *
 * Three things follow from that, and all three are requirements rather than
 * conveniences:
 *
 * 1. **History is never rewritten.** The spoken brief that came first stays
 *    first, with its own time on it, whatever arrives afterwards. A formal
 *    document is a later entry, not a replacement - so a reader can always see
 *    that the work was described before it was instructed.
 * 2. **A document is context because somebody said so.** The `doc:` marker in
 *    an entry is what makes a document part of the job scope. It is not the
 *    same as referencing it in a report, and not the same as appending it to a
 *    PDF - those are separate acts on separate tables, and nothing here does
 *    either of them.
 * 3. **A project written before this existed still reads.** A description with
 *    no markers is one undated entry, which is what it always was.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node without a database.
 */

/** One thing somebody recorded about the scope, with when they recorded it. */
export type BriefEntry = {
  /** `YYYY-MM-DD HH:MM`, or null on text written before this existed. */
  at: string | null;
  text: string;
  /** The document this entry brought into the job scope, where it brought one. */
  documentId: string | null;
};

const MARKER = /^\[(\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d)\][ \t]*/;
const DOCUMENT_MARKER = /\(doc:([0-9a-f-]{36})\)/i;

/** Whether a string is a stamp this module will write. */
export function isBriefStamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Reads the brief back out.
 *
 * Total: every input produces a sensible answer and nothing throws. Text with
 * no markers is one undated entry, which is every project description written
 * before the job brief existed.
 */
export function parseJobBrief(description: string | null | undefined): BriefEntry[] {
  const text = typeof description === "string" ? description : "";
  if (!text.trim()) return [];

  const entries: BriefEntry[] = [];
  let current: { at: string | null; lines: string[] } | null = null;

  for (const line of text.split("\n")) {
    const marker = MARKER.exec(line);
    if (marker) {
      if (current) entries.push(finish(current));
      current = { at: marker[1]!, lines: [line.slice(marker[0].length)] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { at: null, lines: [line] };
    }
  }
  if (current) entries.push(finish(current));

  return entries.filter((entry) => entry.text.length > 0);
}

function finish(current: { at: string | null; lines: string[] }): BriefEntry {
  const body = current.lines.join("\n").trim();
  const document = DOCUMENT_MARKER.exec(body);
  return { at: current.at, text: body, documentId: document ? document[1]!.toLowerCase() : null };
}

/**
 * Adds one entry to the end of the brief.
 *
 * The previous text is returned verbatim with the new entry after it: the
 * result always begins with everything already there, which is what makes
 * "do not rewrite history" a property of the write rather than a matter of
 * care. A blank entry changes nothing.
 */
export function appendBriefEntry(
  description: string | null | undefined,
  text: string,
  at?: string | null,
): string {
  const previous = typeof description === "string" ? description : "";
  const addition = text.trim();
  if (!addition) return previous;

  const entry = isBriefStamp(at) ? `[${at}] ${addition}` : addition;
  const head = previous.replace(/\s+$/, "");
  return head ? `${head}\n\n${entry}` : entry;
}

/** The line written when a document is brought into the job scope. */
export function documentEntryText(title: string, documentId: string): string {
  return `Job document added: ${title.trim() || "Untitled document"} (doc:${documentId})`;
}

/** Whether this exact entry is already the last thing in the brief. */
export function briefAlreadyEnds(
  description: string | null | undefined,
  text: string,
  at?: string | null,
): boolean {
  const previous = typeof description === "string" ? description : "";
  const addition = text.trim();
  if (!addition || !previous.trim()) return false;
  const entry = isBriefStamp(at) ? `[${at}] ${addition}` : addition;
  return previous.replace(/\s+$/, "").endsWith(entry);
}

/** Every document somebody has brought into the job scope, oldest first. */
export function briefDocumentIds(description: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const entry of parseJobBrief(description)) {
    if (entry.documentId) seen.add(entry.documentId);
  }
  return Array.from(seen);
}

/** Whether this document is already part of the job scope. */
export function briefHasDocument(
  description: string | null | undefined,
  documentId: string,
): boolean {
  return briefDocumentIds(description).includes(documentId.toLowerCase());
}

/**
 * The scope in a line or two, for a screen that has other work to do.
 *
 * The words somebody wrote, not a summary of them - nothing here interprets
 * the brief, and a screen that paraphrased it would be inventing scope.
 */
export function briefSummary(
  description: string | null | undefined,
  limit = 180,
): { text: string; entries: number; documents: number } | null {
  const entries = parseJobBrief(description);
  if (entries.length === 0) return null;

  // The first thing said is what the job is. Later entries refine it.
  const first = entries.find((entry) => !entry.documentId) ?? entries[0]!;
  const flat = first.text.replace(/\s+/g, " ").trim();
  return {
    text: flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`,
    entries: entries.length,
    documents: briefDocumentIds(description).length,
  };
}

/**
 * The brief as the AI is given it.
 *
 * Every entry in order, with its time, so the model can see that the work was
 * described before it was instructed. Null where there is no brief at all -
 * a heading with nothing under it would invite the model to fill it.
 */
export function briefForPrompt(description: string | null | undefined): string | null {
  const entries = parseJobBrief(description);
  if (entries.length === 0) return null;
  return entries
    .map((entry) => (entry.at ? `[${entry.at}] ${entry.text}` : entry.text))
    .join("\n");
}


/**
 * Whether this job has a brief at all.
 *
 * The one question the screen and the action both have to answer the same way.
 * Any recorded entry counts - a sentence dictated in the van, a document added
 * to the scope, or a plain description written before any of this existed. The
 * empty box under an existing brief is for adding another entry, and must never
 * make the job look as though it has none.
 */
export function hasJobBrief(description: string | null | undefined): boolean {
  return parseJobBrief(description).length > 0;
}
