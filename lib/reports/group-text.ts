/**
 * One writing area per visible section, over several stored sections - with
 * boundaries a person cannot edit by accident.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be tested
 * without a database.
 *
 * ## Why this is not text parsing
 *
 * The first version of this put every section of a group into one textarea,
 * separated by the section's name on its own line, and split it back apart on
 * save. It read well and it was wrong: the boundary between "Works completed"
 * and "Planned works" was a line of ordinary prose sitting in an editable box.
 * Delete that line by accident - and people do, on a phone, one-handed - and
 * next Monday's screed silently became work completed last Friday. That is a
 * status change nobody made, in a document that may be read back in a dispute.
 *
 * So there is no parsing of prose here, and there is no delimiter a person can
 * type over. Each stored section has its own field, named after the section
 * type, and the save reads the field for each section of the group and takes
 * its value verbatim. Text can only be in the section whose field it was typed
 * into. Moving a sentence between sections takes a deliberate cut and paste
 * from one part of the box to another, which is exactly the level of intent
 * such a move deserves.
 *
 * The screen still shows one writing area per visible section - the fields sit
 * inside one surface, under quiet labels that are page furniture rather than
 * text - so nothing about the simplification the tester asked for is given
 * back. See components/reports/group-editor.tsx.
 */

export type GroupTextSection = {
  type: string;
  label: string;
  content?: string | null;
};

/**
 * The form field carrying one stored section.
 *
 * Prefixed so it can never collide with `groupKey` or anything else on the
 * form, and derived from the section type rather than from its label: a label
 * is wording that may be improved one day, and a section type is an enum value
 * in Postgres.
 */
export const SECTION_FIELD_PREFIX = "section:";

export function sectionFieldName(type: string): string {
  return `${SECTION_FIELD_PREFIX}${type}`;
}

/**
 * The submitted text for each stored section of one group.
 *
 * Reads only the fields belonging to the sections it was given. A field naming
 * a section of another group - or one invented by hand in a request - is not
 * read at all, so a section can never be written by a form that was not
 * showing it.
 */
export function readGroupFields(
  get: (name: string) => string | null | undefined,
  sections: readonly GroupTextSection[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const section of sections) {
    const raw = get(sectionFieldName(section.type));
    values[section.type] = typeof raw === "string" ? raw.trim() : "";
  }
  return values;
}

/**
 * What changed, so a save touches only the sections a person actually altered.
 *
 * The protection rule is unchanged and this is what keeps it: a section is
 * marked as written by a person only when its own text moved. Editing one
 * paragraph must not quietly claim the others and exempt them from the next
 * regeneration.
 */
export function changedSections(
  sections: readonly GroupTextSection[],
  values: Record<string, string>,
): { type: string; content: string }[] {
  return sections
    .filter((section) => (section.content ?? "").trim() !== (values[section.type] ?? "").trim())
    .map((section) => ({ type: section.type, content: values[section.type] ?? "" }));
}

/**
 * Which parts of a group get a writing area.
 *
 * The ones already written, and - where nothing is written at all - the first,
 * so there is always somewhere to start. Deliberately NOT every stored section:
 * a Daily Report would show eight empty boxes again, which is the clutter this
 * whole batch removed.
 *
 * Computed once when the editor mounts and then left alone, so a box never
 * appears or disappears under somebody's thumb while they are typing.
 */
export function editableSections<T extends GroupTextSection>(sections: readonly T[]): T[] {
  const written = sections.filter((section) => section.content?.trim());
  if (written.length > 0) return written;
  return sections.length > 0 ? [sections[0]] : [];
}
