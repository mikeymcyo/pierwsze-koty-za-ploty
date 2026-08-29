/**
 * What a whole-report review is, and what accepting one is allowed to change.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a database or a model.
 *
 * The review itself is advice. Nothing here writes anything: the model's reply
 * is reconciled against the report as it actually stands, the user ticks what
 * they want, and only those sections are handed back to be saved. A warning
 * never changes a word, and a section the user did not tick is not in the list
 * at all.
 */

export type ReviewWarningType = "contradiction" | "missing" | "wording" | "other";
export type ReviewSeverity = "high" | "medium" | "low";

/** One section, as it stands and as the reviewer would have it. */
export type ReviewedSection = {
  sectionType: string;
  label: string;
  originalText: string;
  proposedText: string;
  /** Recomputed here, never taken from the model's own claim. */
  changed: boolean;
  /** One short sentence, present only where something changed. */
  reason: string | null;
  /** True where a person wrote this section by hand. */
  wasManual: boolean;
};

export type ReviewWarning = {
  type: ReviewWarningType;
  severity: ReviewSeverity;
  message: string;
  /** The section it concerns, where the reviewer named one we recognise. */
  relatedSection: string | null;
};

export type MasterReview = {
  sections: ReviewedSection[];
  warnings: ReviewWarning[];
  assessment: string;
};

/** A section of the report as it stands right now. */
export type CurrentSection = {
  sectionType: string;
  label: string;
  content: string | null;
  aiGenerated: boolean;
};

/** One entry of the model's reply, before it has been checked against reality. */
export type ProposedSection = {
  sectionType: string;
  proposedText: string;
  reason?: string | null;
};

const WARNING_TYPES: ReviewWarningType[] = ["contradiction", "missing", "wording", "other"];
const SEVERITIES: ReviewSeverity[] = ["high", "medium", "low"];

function normaliseText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * Reconciles the model's reply with the report as it actually stands.
 *
 * Three things are deliberately not trusted from the model.
 *
 * A section type it invented is discarded: a review may improve what is
 * written, never conjure a section the document does not have. A section it
 * omitted is carried through unchanged rather than treated as emptied, because
 * a reply that ran short must not silently delete a paragraph. And its own
 * `changed` flag is ignored in favour of comparing the text, since a model
 * that reformats a line and calls it unchanged would otherwise slip an edit
 * past the user.
 *
 * Order follows the report, not the reply.
 */
export function reconcileReview(
  current: readonly CurrentSection[],
  proposed: readonly ProposedSection[],
  warnings: readonly ReviewWarning[],
  assessment: string,
): MasterReview {
  const byType = new Map(proposed.map((entry) => [entry.sectionType, entry]));
  const known = new Set(current.map((section) => section.sectionType));

  const sections = current.map((section) => {
    const original = normaliseText(section.content);
    const entry = byType.get(section.sectionType);
    const proposedText = entry ? normaliseText(entry.proposedText) : original;
    const changed = proposedText !== original;
    return {
      sectionType: section.sectionType,
      label: section.label,
      originalText: original,
      proposedText,
      changed,
      reason: changed ? normaliseText(entry?.reason) || null : null,
      wasManual: !section.aiGenerated,
    };
  });

  return {
    sections,
    // A warning pointing at a section nobody has is not useful, but the warning
    // itself may still be - so the pointer is dropped, not the warning.
    warnings: warnings
      .filter((warning) => normaliseText(warning.message).length > 0)
      .map((warning) => ({
        type: WARNING_TYPES.includes(warning.type) ? warning.type : "other",
        severity: SEVERITIES.includes(warning.severity) ? warning.severity : "medium",
        message: normaliseText(warning.message),
        relatedSection:
          warning.relatedSection && known.has(warning.relatedSection)
            ? warning.relatedSection
            : null,
      })),
    assessment: normaliseText(assessment),
  };
}

/** Every section the reviewer would actually change. */
export function changedSections(review: MasterReview): ReviewedSection[] {
  return review.sections.filter((section) => section.changed);
}

/**
 * What "Accept all wording changes" is allowed to tick.
 *
 * Deliberately not everything. A section somebody wrote by hand carries their
 * judgement of what mattered that day, and a single tap that quietly replaces
 * several of those is exactly the thing this feature must not do. Those are
 * offered one at a time, so accepting one is a decision about that paragraph.
 */
export function bulkAcceptableSections(review: MasterReview): string[] {
  return review.sections
    .filter((section) => section.changed && !section.wasManual)
    .map((section) => section.sectionType);
}

/** Whether anything at all is on offer. */
export function hasProposals(review: MasterReview): boolean {
  return review.sections.some((section) => section.changed) || review.warnings.length > 0;
}

/**
 * The writes to make, given what the user ticked.
 *
 * The only route from a review to the database. A section is written when the
 * user accepted it *and* the reviewer actually changed it - so an accidental
 * tick on an unchanged section writes nothing, an untick writes nothing, and a
 * section that was never on the list cannot be written at all. Warnings are
 * not consulted; they change nothing by design.
 */
export function sectionsToApply(
  review: MasterReview,
  acceptedTypes: readonly string[],
): { sectionType: string; content: string }[] {
  const accepted = new Set(acceptedTypes);
  return review.sections
    .filter((section) => section.changed && accepted.has(section.sectionType))
    .map((section) => ({ sectionType: section.sectionType, content: section.proposedText }));
}

/** One sentence for after the save, naming what moved. */
export function describeApplied(count: number): string {
  if (count === 0) return "Nothing was changed.";
  return count === 1
    ? "1 section updated. The report is still fully editable."
    : `${count} sections updated. The report is still fully editable.`;
}

export const REVIEW_NEEDS_DRAFT =
  "This report has been issued. Reopen it before running a review, so the issued PDF and the record cannot drift apart.";
