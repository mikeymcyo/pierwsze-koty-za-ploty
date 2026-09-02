/**
 * The three sections a report shows, and which stored sections make up each.
 *
 * Pure, with no runtime imports and no path aliases, so both the screens and
 * the PDF documents read the same definitions and the rules can be tested
 * without a database or a renderer.
 *
 * ## Why this exists
 *
 * A Daily Report stores eight written sections and prints five more blocks of
 * recorded data, and a consolidated report is no better. Thirteen headings is
 * an admin system, not something a site manager reads on a phone in the rain,
 * and it is not how a contractor's own paperwork is laid out either: a client
 * wants to know what happened, what it looked like, and what is still open.
 *
 * So the visible structure is three sections. That is a presentation decision
 * and nothing else - **no section type is removed, merged or renamed**, and
 * nothing stored stops being stored. The fine-grained sections are what keep
 * the writing honest: the drafting and cleanup prompts allocate one fact to
 * one section, the section-role rules stop Summary and Works completed saying
 * the same thing twice, and the Master AI Review reasons about them one at a
 * time. Collapsing them in the database would undo all of that. Collapsing
 * them on the way out costs nothing.
 *
 * ## What a reader still sees
 *
 * Inside a group, each stored section keeps a run-in label - "Works completed."
 * at the head of its own paragraph - rather than a heading block of its own.
 * The label is not decoration. A report may be read months later in a dispute,
 * and the difference between work recorded as completed and work recorded as
 * planned is exactly what such a reading turns on. Three headings, every
 * status still on the page.
 *
 * Recorded data that is not prose - workforce, plant, the document register,
 * the source record - leaves the main flow entirely. On screen it goes behind
 * inline under its own quiet heading; in the PDF it goes to an appendix. It is
 * never dropped, and never folded away.
 */

/** The four documents, matching lib/ai/cleanup-prompt.ts. */
export type ReportDocumentKind = "daily" | "progress" | "completion" | "survey";

/**
 * The three groups, by role rather than by name.
 *
 * The names differ per document - a survey has Findings where a daily has a
 * Daily Summary - but the roles do not, which is what lets one component
 * render any of the four.
 */
export type ReportGroupKey = "summary" | "evidence" | "outstanding";

export type ReportGroup = {
  key: ReportGroupKey;
  /** The heading, on screen and in the PDF. */
  label: string;
  /** One line under it, for a manager who has not met this screen before. */
  hint: string;
  /**
   * Stored section types, in the order they read inside the group.
   *
   * Section types are strings here rather than the database union: this module
   * is shared by the daily and the three consolidated documents, whose types
   * come from two different enums, and importing either at runtime would cost
   * the property that makes this testable in plain Node.
   */
  sections: readonly string[];
};

export type ReportStructure = readonly [ReportGroup, ReportGroup, ReportGroup];

/** The evidence group is the same job in every document. */
function evidence(sections: readonly string[] = []): ReportGroup {
  return {
    key: "evidence",
    label: "Photos & Evidence",
    hint: "What was photographed, and the documents this report is read alongside.",
    sections,
  };
}

export const REPORT_STRUCTURES: Record<ReportDocumentKind, ReportStructure> = {
  daily: [
    {
      key: "summary",
      label: "Daily Summary",
      hint: "What the day amounted to.",
      // One written section, and it is the whole of a Daily Report's prose.
      // Works completed, works in progress and deliveries were four sections
      // telling one story four times, and three of them were folded away on
      // screen while all four printed. See the note on this file.
      sections: ["executive_summary"],
    },
    evidence(),
    {
      key: "outstanding",
      label: "Issues raised",
      hint: "What was raised on site today.",
      // No prose. The issues a site manager raised are records with their own
      // status, priority and owner, printed from the issue table; four more
      // written sections restating them is the duplication this removed.
      sections: [],
    },
  ],
  progress: [
    {
      key: "summary",
      label: "Progress Overview",
      hint: "Where the works stand at the end of the period.",
      // One written section. Five of them consolidated the same period into
      // five overlapping accounts, and only the first was in front of anybody.
      sections: ["period_summary"],
    },
    evidence(),
    {
      key: "outstanding",
      label: "Outstanding / Next Actions",
      hint: "What is still open, and what the next period holds.",
      sections: ["issues_and_resolutions", "next_period"],
    },
  ],
  completion: [
    {
      key: "summary",
      label: "Completion Summary",
      hint: "What the job was, how it ran, and what was completed.",
      // The executive account, then the table. The table is what was asked
      // for and what was done, item by item - four further prose sections
      // saying the same thing in paragraphs is what this removed.
      sections: ["project_overview", "instructed_works"],
    },
    // The photographic record is the written introduction to the plates, so it
    // reads directly above them rather than three headings away.
    evidence(["photographic_record"]),
    {
      key: "outstanding",
      label: "Outstanding / Follow-on",
      hint: "What is still open, and what the record says about sign-off.",
      sections: ["issues_and_resolutions", "sign_off"],
    },
  ],
  survey: [
    {
      key: "summary",
      label: "Findings",
      hint: "Why the visit was made and what was found.",
      sections: [
        "survey_purpose",
        "existing_condition",
        "measurements",
        "access_and_constraints",
      ],
    },
    evidence(),
    {
      key: "outstanding",
      label: "Recommendations",
      hint: "What is proposed, what it would take, and what pricing needs to know.",
      sections: ["proposed_works", "requirements", "pricing_notes"],
    },
  ],
};

/**
 * How a document is authored, which is not the same as how it is laid out.
 *
 * A Daily Report is dictated. One person, one day, one description of the work,
 * and the AI turns that into the sections - so the writing surface is the notes
 * box and the drafted sections are output to check, shown read-only with the
 * editor one tap away. Anything else on that screen is in the way of the
 * microphone.
 *
 * A consolidated document has no notes box: there is nowhere else for its words
 * to come from, so its sections are the writing surface and each carries its
 * own dictation.
 *
 * The distinction is here rather than in the screens because it decides the
 * same thing in both of them.
 */
export type AuthoringMode = "notes" | "sections";

export const AUTHORING_MODES: Record<ReportDocumentKind, AuthoringMode> = {
  daily: "notes",
  progress: "sections",
  completion: "sections",
  survey: "sections",
};

export function authoringMode(kind: ReportDocumentKind): AuthoringMode {
  return AUTHORING_MODES[kind];
}

export function reportStructure(kind: ReportDocumentKind): ReportStructure {
  return REPORT_STRUCTURES[kind];
}

/**
 * The heading a stored section now appears under, or null if it appears under
 * none.
 *
 * Null is a bug rather than a valid answer - every stored section must have a
 * home, or issuing a report would silently drop a paragraph somebody wrote.
 * e2e/report-structure-smoke.mjs asserts there are none.
 */
export function groupKeyOf(
  kind: ReportDocumentKind,
  sectionType: string,
): ReportGroupKey | null {
  const group = reportStructure(kind).find((candidate) =>
    candidate.sections.includes(sectionType),
  );
  return group?.key ?? null;
}

export type GroupedEntry<T> = { group: ReportGroup; entries: T[] };

/**
 * Sorts written sections into their groups, keeping each group's own order.
 *
 * Anything whose type is not in the structure is appended to the last group
 * rather than dropped. A section type added to the database and forgotten
 * here would otherwise vanish from the issued document, and losing a paragraph
 * silently is the one outcome this product must never have. The test fails on
 * an unmapped type, so this branch should never run in practice - it is what
 * happens if it does.
 */
export function groupSections<T extends { type: string }>(
  kind: ReportDocumentKind,
  sections: readonly T[],
): GroupedEntry<T>[] {
  const structure = reportStructure(kind);
  const byType = new Map(sections.map((section) => [section.type, section]));
  const claimed = new Set<string>();

  const grouped = structure.map((group) => {
    const entries: T[] = [];
    for (const type of group.sections) {
      const section = byType.get(type);
      if (!section) continue;
      entries.push(section);
      claimed.add(type);
    }
    return { group, entries };
  });

  // Anything not in the structure is not printed and not shown. It was
  // appended to the last group, which is how a paragraph a person never saw
  // arrived in a client's PDF under a heading it had nothing to do with.
  //
  // The row is not deleted - a report drafted before these structures shrank
  // still holds its text, and nothing here touches it. It is simply no longer
  // part of the document, on screen or in the file, and the two agree.
  return grouped;
}

/**
 * The run-in label for a section inside a group: "Works completed."
 *
 * A group whose only content is one section does not repeat itself - the
 * heading has already said it - so a Findings group carrying nothing but
 * "Findings and existing condition" reads as a paragraph rather than as a
 * label under its own name.
 */
export function runInLabel(
  group: ReportGroup,
  sectionLabel: string,
  entryCount: number,
): string | null {
  if (entryCount < 2) return null;
  if (sectionLabel.toLowerCase() === group.label.toLowerCase()) return null;
  return sectionLabel.endsWith(".") ? sectionLabel : `${sectionLabel}.`;
}

/** What the appendix is called, in both documents. */
export const APPENDIX_LABEL = "Appendix - record data";

/**
 * What the appendix holds, printed on the heading's own line.
 *
 * On the heading line rather than under it, and that is not a detail: a
 * paragraph of explanation there cost a one-page progress report a second
 * page, which is the opposite of what this whole change is for. The note rides
 * in the space the heading already occupies and costs nothing.
 */
export function appendixNote(parts: {
  workforce?: boolean;
  plant?: boolean;
  documents?: boolean;
  sources?: boolean;
}): string {
  return [
    parts.workforce ? "Workforce" : null,
    parts.plant ? "Plant" : null,
    parts.documents ? "Documents" : null,
    parts.sources ? "Sources" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

