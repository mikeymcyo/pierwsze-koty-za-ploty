/**
 * Whether a report screen may write the notes it is holding.
 *
 * The report page loads `raw_notes` once and posts the whole box back on
 * Save draft and on Write my report. Site Capture, meanwhile, appends to the
 * same column from another phone, several times a day. Without a check, an
 * office screen opened at eight in the morning would erase every capture made
 * since, the moment somebody pressed Save at four.
 *
 * So the screen also posts what it loaded (`base`), and the write is decided
 * from three values: what was loaded, what is being posted, and what the
 * database holds now.
 *
 *  - The person did not touch the notes: the notes are left out of the write
 *    altogether. The date, weather, workforce and plant still save, and any
 *    captures added meanwhile stay exactly where they are.
 *  - The person changed the notes and nobody else did: written, with the
 *    database's current value as the compare-and-set condition so two saves
 *    racing each other cannot both pass.
 *  - The person changed the notes and so did somebody else: refused, with a
 *    message. Their words are still in the box; the other person's words are
 *    still in the database; a reload shows both.
 *
 * A screen from before this check posts no base at all and is treated as it
 * always was, so an old tab does not start refusing to save.
 *
 * Pure, no runtime imports, tested directly.
 */

export const NOTES_CHANGED_ELSEWHERE =
  "The notes changed elsewhere since this screen loaded - a Site Capture was added or another device saved. Nothing was overwritten. Reload to see the latest notes, then make your change again.";

export type NotesWriteDecision =
  | { kind: "write"; expect: string | null }
  | { kind: "skip" }
  | { kind: "conflict" };

/** Null and whitespace-only are the same empty box. */
export function normaliseNotes(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function decideNotesWrite(input: {
  /** What the screen loaded, or null when the screen predates the check. */
  base: string | null;
  /** What the screen is posting now. */
  posted: string | null;
  /** What the database holds now. */
  current: string | null;
}): NotesWriteDecision {
  if (input.base === null) return { kind: "write", expect: input.current };

  const base = normaliseNotes(input.base);
  const posted = normaliseNotes(input.posted);
  const current = normaliseNotes(input.current);

  if (posted === base) return { kind: "skip" };
  if (current !== base) return { kind: "conflict" };
  return { kind: "write", expect: input.current };
}
