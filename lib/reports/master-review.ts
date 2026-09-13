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
  /**
   * The recorded issue it is about, where the reviewer named one we handed
   * it. This is what makes a finding actionable: the controls on the finding
   * move this issue, through the same lifecycle as anywhere else.
   */
  relatedIssueId: string | null;
  /**
   * A short title for a possible new issue the prose or a photograph
   * reveals and no recorded issue carries. Offered to a person as "Create
   * issue"; nothing is raised until they say so.
   */
  suggestedIssue: string | null;
};

/** A recorded issue as the review knows it, for the controls on a finding. */
export type ReviewIssue = {
  id: string;
  title: string;
  status: string;
};

/**
 * The reviewer's warning as it comes back, before the issue handle it names
 * has been turned into an id. Handles are what the model is shown - "I1",
 * "I2" - so a warning can point at an issue without the model ever seeing,
 * or being able to invent, a database id.
 */
export type ProposedWarning = {
  type: string;
  severity: string;
  message: string;
  relatedSection: string | null;
  relatedIssue?: string | null;
  suggestedIssue?: string | null;
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
 * omitted - or returned without usable text - is carried through unchanged
 * rather than treated as emptied, because a reply that ran short must not
 * silently propose deleting a paragraph. And its own `changed` flag is ignored
 * in favour of comparing the text, since a model that reformats a line and
 * calls it unchanged would otherwise slip an edit past the user.
 *
 * Order follows the report, not the reply.
 */
export function reconcileReview(
  current: readonly CurrentSection[],
  proposed: readonly ProposedSection[],
  warnings: readonly (ProposedWarning | ReviewWarning)[],
  assessment: string,
): MasterReview {
  const byType = new Map(proposed.map((entry) => [entry.sectionType, entry]));
  const known = new Set(current.map((section) => section.sectionType));

  const sections = current.map((section) => {
    const original = normaliseText(section.content);
    const entry = byType.get(section.sectionType);
    // Only an actual string counts as a proposal. An empty string is a
    // deliberate request to clear the section and is honoured; a missing or
    // non-string value is a malformed reply, and treating that as "empty this
    // section" would let a bad response propose destroying a paragraph.
    const proposedText =
      entry && typeof entry.proposedText === "string"
        ? normaliseText(entry.proposedText)
        : original;
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
        type: WARNING_TYPES.includes(warning.type as ReviewWarningType)
          ? (warning.type as ReviewWarningType)
          : "other",
        severity: SEVERITIES.includes(warning.severity as ReviewSeverity)
          ? (warning.severity as ReviewSeverity)
          : "medium",
        message: normaliseText(warning.message),
        relatedSection:
          warning.relatedSection && known.has(warning.relatedSection)
            ? warning.relatedSection
            : null,
        relatedIssueId:
          "relatedIssueId" in warning && typeof warning.relatedIssueId === "string"
            ? warning.relatedIssueId
            : null,
        suggestedIssue: normaliseText(
          "suggestedIssue" in warning && typeof warning.suggestedIssue === "string"
            ? warning.suggestedIssue
            : null,
        ) || null,
      })),
    assessment: normaliseText(assessment),
  };
}

const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Turns the handles the model was shown into the ids the controls need.
 *
 * A handle we did not hand out is dropped rather than guessed at: a finding
 * that moves the wrong issue is worse than one with no controls. A warning
 * that names a recorded issue cannot also propose a new one - the recorded
 * issue is the one to act on - so the suggestion is cleared in that case.
 */
export type LinkedWarning = ProposedWarning & { relatedIssueId: string | null };

export function linkWarningsToIssues(
  warnings: readonly ProposedWarning[],
  issues: readonly { handle: string; id: string }[],
): LinkedWarning[] {
  const byHandle = new Map(issues.map((issue) => [issue.handle.trim().toUpperCase(), issue.id]));
  return warnings.map((warning) => {
    const handle = (warning.relatedIssue ?? "").trim().replace(/^\[|\]$/g, "").toUpperCase();
    const relatedIssueId = handle ? (byHandle.get(handle) ?? null) : null;
    return {
      type: warning.type,
      severity: warning.severity,
      message: warning.message,
      relatedSection: warning.relatedSection,
      relatedIssueId,
      suggestedIssue: relatedIssueId ? null : (warning.suggestedIssue ?? null),
    };
  });
}

/**
 * One actionable finding per recorded issue.
 *
 * A reviewer given an issue that is open in the tracker, resolved in the
 * prose and pictured in a photograph tends to raise three warnings about it,
 * and a person on a phone then reads the same contradiction three times
 * before they can act once. Per issue this keeps the most severe finding
 * that is not a gap (a contradiction outranks wording at equal severity),
 * plus at most one genuinely separate missing-information finding. Findings
 * about no recorded issue are untouched, and order is otherwise preserved.
 */
export function collapseIssueWarnings(warnings: readonly ReviewWarning[]): ReviewWarning[] {
  const kept: ReviewWarning[] = [];
  const chosen = new Map<string, { actionable?: ReviewWarning; missing?: ReviewWarning }>();
  for (const warning of warnings) {
    if (!warning.relatedIssueId) {
      kept.push(warning);
      continue;
    }
    const slot = chosen.get(warning.relatedIssueId) ?? {};
    const key = warning.type === "missing" ? "missing" : "actionable";
    const holder = slot[key];
    const better =
      !holder ||
      SEVERITY_RANK[warning.severity] < SEVERITY_RANK[holder.severity] ||
      (SEVERITY_RANK[warning.severity] === SEVERITY_RANK[holder.severity] &&
        warning.type === "contradiction" &&
        holder.type !== "contradiction");
    if (better) {
      if (holder) kept.splice(kept.indexOf(holder), 1, warning);
      else kept.push(warning);
      slot[key] = warning;
      chosen.set(warning.relatedIssueId, slot);
    }
  }
  return kept;
}

/** What a person did about a finding, from the controls on it. */
export type FindingOutcome =
  | "kept"
  | "in_progress"
  | "reopened"
  | "resolved"
  | "created"
  | "ignored";

export const WARNING_HEADING: Record<ReviewWarningType, string> = {
  contradiction: "Possible contradiction",
  missing: "Missing information",
  wording: "Wording",
  other: "Worth a look",
};

/**
 * One line after findings have been actioned.
 *
 * The review on the screen is a moment that has passed once an issue moves:
 * the finding is cleared, the report's own issue list has already refreshed,
 * and the honest next step is to read the document again - which is why the
 * line says so rather than pretending the review re-ran itself.
 */
export function describeActioned(outcomes: readonly FindingOutcome[]): string | null {
  const acted = outcomes.filter((outcome) => outcome !== "kept" && outcome !== "ignored");
  const cleared = outcomes.length - acted.length;
  if (outcomes.length === 0) return null;
  const parts: string[] = [];
  const count = (outcome: FindingOutcome, singular: string, plural: string) => {
    const n = outcomes.filter((entry) => entry === outcome).length;
    if (n > 0) parts.push(`${n} ${n === 1 ? singular : plural}`);
  };
  count("resolved", "issue resolved", "issues resolved");
  count("in_progress", "issue marked in progress", "issues marked in progress");
  count("reopened", "issue reopened", "issues reopened");
  count("created", "issue raised", "issues raised");
  if (cleared > 0) parts.push(`${cleared} ${cleared === 1 ? "finding" : "findings"} left as ${cleared === 1 ? "it was" : "they were"}`);
  const summary = parts.join(", ");
  return acted.length > 0
    ? `${summary}. Review again to confirm the report now reads clean.`
    : `${summary}.`;
}

/** Findings that carry a control: an issue to move, or one to raise. */
export function actionableWarnings(warnings: readonly ReviewWarning[]): ReviewWarning[] {
  return warnings.filter((warning) => warning.relatedIssueId || warning.suggestedIssue);
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
