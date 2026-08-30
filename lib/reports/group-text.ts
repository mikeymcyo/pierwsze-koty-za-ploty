/**
 * One writing box per visible section, over several stored sections.
 *
 * Pure, with no runtime imports and no path aliases, so the round-trip can be
 * tested without a database.
 *
 * ## Why
 *
 * Grouping the headings was not enough. A Progress Report still put five
 * separate textareas on the screen - Period summary, Key activities, Works
 * completed, Works in progress, Resources and plant - and five boxes is five
 * boxes whichever heading they sit under. On an iPad, in a van, that is a
 * form to be endured rather than a report to be written.
 *
 * So each visible section gets ONE box. The stored sections underneath are
 * untouched: the drafting and cleanup prompts still write them one at a time,
 * the Master AI Review still reasons about them one at a time, and the PDF
 * still prints each with its own run-in label. What changes is only how they
 * are handed to a person to edit.
 *
 * ## The format
 *
 * Each stored section appears as its own name on a line, then its text:
 *
 *     Works completed
 *     Ducting was laid to the east elevation.
 *
 *     Planned works
 *     Screed is programmed to start on Monday.
 *
 * Those name lines are the seam. Parsing puts each block back into the section
 * it came from, so a round-trip through the box changes nothing, and a person
 * can move a sentence from one section to another by moving it across a name
 * line - which is exactly the edit they would otherwise have made with two
 * textareas and a lot of scrolling.
 *
 * Where a group holds one stored section there is no name line at all: a lone
 * label under a heading that already says the same thing is noise.
 *
 * ## What happens to text nobody labelled
 *
 * It goes to the first section of the group. That is the case that matters
 * most: an empty box somebody dictates a paragraph into. It lands in the
 * group's leading section, which is the one whose brief describes an overview,
 * and the drafting pass can allocate it properly from there. Text is never
 * dropped for having no label.
 */

export type GroupTextSection = {
  type: string;
  label: string;
  content?: string | null;
};

/** A label line, as written and as recognised: "Works completed", "Works completed:". */
function labelKey(line: string): string {
  return line
    .trim()
    .replace(/[.:–—-]+$/, "")
    .trim()
    .toLowerCase();
}

/**
 * The group's stored sections as one editable block.
 *
 * Only sections carrying text appear. An empty section is a correct answer
 * from the drafting pass, and printing its name over a blank line would invite
 * somebody to fill it - which is the padding the whole product works against.
 */
export function composeGroupText(sections: readonly GroupTextSection[]): string {
  const written = sections.filter((section) => section.content?.trim());
  if (written.length === 0) return "";

  // One stored section means the box is simply that section.
  if (sections.length === 1) return (written[0].content ?? "").trim();

  return written
    .map((section) => `${section.label}\n${(section.content ?? "").trim()}`)
    .join("\n\n");
}

/**
 * The block split back into the sections it came from.
 *
 * Returns an entry for every section in the group, including the ones that
 * ended up empty - the caller needs to know a section was cleared, not merely
 * that it was not mentioned.
 */
export function parseGroupText(
  text: string,
  sections: readonly GroupTextSection[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const section of sections) result[section.type] = "";
  if (sections.length === 0) return result;

  const trimmed = text.trim();
  if (!trimmed) return result;

  // One stored section: nothing to split, and no label to look for.
  if (sections.length === 1) {
    result[sections[0].type] = trimmed;
    return result;
  }

  const byLabel = new Map(sections.map((section) => [labelKey(section.label), section.type]));
  // Anything before the first name line belongs to the leading section - see
  // the note above about a box somebody has just dictated into.
  let current = sections[0].type;
  const lines: Record<string, string[]> = {};
  for (const section of sections) lines[section.type] = [];

  for (const line of trimmed.split("\n")) {
    const matched = byLabel.get(labelKey(line));
    // A name line only opens a section when the line is the name and nothing
    // else, so a sentence that happens to begin "Works completed to the east
    // elevation" stays prose.
    if (matched) {
      current = matched;
      continue;
    }
    lines[current].push(line);
  }

  for (const section of sections) {
    result[section.type] = lines[section.type].join("\n").trim();
  }
  return result;
}

/**
 * What changed, so a save touches only the sections a person actually altered.
 *
 * The protection rule is unchanged and this is what keeps it: a section is
 * marked as written by a person only when its own text moved. Editing one
 * paragraph in the box must not quietly claim the other three and exempt them
 * from the next regeneration.
 */
export function changedSections(
  sections: readonly GroupTextSection[],
  parsed: Record<string, string>,
): { type: string; content: string }[] {
  return sections
    .filter((section) => (section.content ?? "").trim() !== (parsed[section.type] ?? "").trim())
    .map((section) => ({ type: section.type, content: parsed[section.type] ?? "" }));
}

/** Said under the box, once, where a group holds more than one section. */
export const GROUP_TEXT_HINT =
  "Each heading below marks where that part of the report starts. Move a sentence across one to move it between them.";
