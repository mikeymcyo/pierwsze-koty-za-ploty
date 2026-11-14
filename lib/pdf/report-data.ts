/**
 * Turning the stored report into the thing the PDF prints.
 *
 * Pure, with no runtime imports and no path aliases, so what ends up in an
 * issued client document can be tested without a database or a renderer. The
 * layout lives in report-document.tsx; every decision about *what* appears -
 * which sections, in which order, which issues and which photos - is made
 * here. How a photograph's caption and status read is decided by
 * lib/photo-captions.ts, which the documents apply.
 */

/** Mirrors the enums in types/database.ts without importing them at runtime. */
type SectionType = string;

export type SectionRow = { section_type: SectionType; content: string | null };
export type IssueRow = {
  id: string;
  title: string;
  description: string | null;
  responsible: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "closed";
};
export type PhotoRow = {
  id: string;
  caption: string | null;
  category: string;
  storage_path: string;
  /** Quarter turns applied while drawing. Absent on a row written before it existed. */
  rotation?: number | null;
};

/**
 * Sections in report order, with anything empty dropped.
 *
 * An empty section is a correct answer from the drafting prompt - the notes
 * did not support it - so it must not appear in the PDF as a heading with
 * nothing under it. A blank heading in a client document reads as an omission
 * rather than as an honest silence.
 */
export function orderedSections<T extends SectionType>(
  rows: readonly SectionRow[],
  order: readonly T[],
  labels: Record<string, string>,
): { type: T; label: string; content: string }[] {
  const byType = new Map(rows.map((row) => [row.section_type, row]));

  return order
    .map((type) => ({ type, content: byType.get(type)?.content?.trim() ?? "" }))
    .filter((section) => section.content.length > 0)
    .map((section) => ({ ...section, label: labels[section.type] ?? section.type }));
}

/**
 * The issues that belong in this report.
 *
 * Everything raised against the report is printed, closed ones included: an
 * item raised and resolved the same day is part of the record of that day, and
 * dropping it would make the report disagree with the site diary. Issues
 * raised elsewhere on the project are not this report's to claim.
 */
export function issuesForReport(
  rows: readonly IssueRow[],
  priorityLabels: Record<string, string>,
  statusLabels: Record<string, string>,
) {
  const rank: Record<IssueRow["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...rows]
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .map((issue) => ({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      responsible: issue.responsible,
      priority: issue.priority,
      priorityLabel: priorityLabels[issue.priority] ?? issue.priority,
      statusLabel: statusLabels[issue.status] ?? issue.status,
    }));
}

/**
 * Pairs each photo with its downloaded bytes, dropping any that failed.
 *
 * A photo whose object could not be read is left out rather than printed as a
 * broken box. The caption and category travel with the image so they cannot be
 * printed against the wrong one.
 */
/**
 * The printable photographs, carrying the caption and status the document will
 * turn into words (see lib/photo-captions.ts).
 *
 * A photograph whose bytes could not be downloaded is dropped rather than
 * printed as a broken box.
 */
export function photosWithData(
  rows: readonly PhotoRow[],
  downloaded: Map<string, Buffer>,
): {
  id: string;
  caption: string | null;
  category: string;
  data: Buffer;
  rotation: number;
}[] {
  const printable: {
    id: string;
    caption: string | null;
    category: string;
    data: Buffer;
    rotation: number;
  }[] = [];

  for (const photo of rows) {
    const data = downloaded.get(photo.storage_path);
    if (!data) continue;
    printable.push({
      id: photo.id,
      caption: photo.caption,
      category: photo.category,
      data,
      // The turn travels with the bytes, so a photograph cannot be printed at
      // one angle and measured at another. Normalising it is the drawing
      // layer's job - this module keeps no runtime imports, which is what lets
      // it load straight into Node for its tests.
      rotation: photo.rotation ?? 0,
    });
  }

  return printable;
}

/** "Report 007" - the number a client quotes back at you, zero-padded to sort. */
export function reportNumberLabel(reportNumber: number): string {
  return String(reportNumber).padStart(3, "0");
}
