/**
 * What may happen to a report after it has been issued: reopening it to make a
 * correction, and deleting it.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be tested
 * without a database and read the same way from every action and screen.
 *
 * The rule that shapes all of this: an issued PDF is what somebody was sent. A
 * correction must never leave a period where the client's copy has been
 * withdrawn and nothing has replaced it. So reopening deliberately keeps the
 * previously issued PDF in place and still current; only a successful
 * re-issue replaces it. Abandoning an edit therefore costs nothing.
 */

export type IssuedState = {
  status: "draft" | "final";
  pdfPath: string | null;
};

export const REOPEN_NOT_ISSUED =
  "This report has not been issued yet, so there is nothing to reopen. It is still a draft.";

export const REOPEN_KEEPS_ISSUED_PDF =
  "The PDF that was already issued stays in place while you edit. It is replaced only when you finalise again.";

/**
 * A report that was issued, reopened, and not yet re-issued.
 *
 * Derived rather than stored: a draft holding the path of an issued PDF can
 * only have got there by being reopened. That keeps the state honest with no
 * extra column to drift out of step with the two that decide it.
 */
export function isReopened(state: IssuedState): boolean {
  return state.status === "draft" && Boolean(state.pdfPath);
}

export function canReopen(state: IssuedState): { ok: true } | { ok: false; message: string } {
  if (state.status !== "final") return { ok: false, message: REOPEN_NOT_ISSUED };
  return { ok: true };
}

/**
 * The revision a re-issue should carry.
 *
 * Revision 0 is the first issue. A report holding an issued PDF is being
 * corrected, so the next one is a revision of it. Counted at issue rather than
 * at reopen, so an abandoned edit never inflates the number.
 */
export function nextRevision(state: { revision: number; pdfPath: string | null }): number {
  return state.pdfPath ? state.revision + 1 : state.revision;
}

/**
 * What the user is told before an issued report is reopened. Deliberately
 * concrete about the one thing that worries people: the copy already sent.
 */
export function reopenWarning(finalisedAt: string | null): string {
  return [
    finalisedAt
      ? `This report was issued on ${finalisedAt}.`
      : "This report has been issued.",
    "Reopening it lets you correct the text and photographs, then issue it again.",
    REOPEN_KEEPS_ISSUED_PDF,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/** A consolidated report that cites the thing being deleted. */
export type DependentDocument = {
  id: string;
  label: string;
};

export const DELETE_CONFIRMATION = "DELETE";

/**
 * Deleting an issued record is not an accident anybody should be able to have
 * with one thumb, so it asks for the word to be typed rather than for a second
 * tap. Drafts are not held to this.
 */
export function confirmationMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION;
}

/**
 * Why this cannot be deleted, or null if it can.
 *
 * A Daily Report underneath an issued Progress or Completion Report is that
 * document's evidence. Deleting it would cascade its photographs away and
 * leave an issued PDF citing a report that no longer exists - a broken
 * evidence trail in a document somebody may be relying on. Blocking and
 * explaining is the only honest answer; silently cascading is not.
 */
export function deletionBlockedBy(
  dependents: readonly DependentDocument[],
): string | null {
  if (dependents.length === 0) return null;
  const many = dependents.length > 1;
  return [
    `This report is evidence for ${many ? "issued reports" : "an issued report"}`,
    ` and cannot be deleted: ${dependents.map((d) => d.label).join(", ")}.`,
    ` Delete ${many ? "those reports" : "that report"} first if you really mean to remove this evidence.`,
  ].join("");
}

/**
 * Whether a delete request is allowed to proceed.
 *
 * `dependents` blocks outright. A final report additionally needs the typed
 * confirmation; a draft does not.
 */
export function canDelete(input: {
  status: "draft" | "final";
  dependents: readonly DependentDocument[];
  typedConfirmation: string;
}): { ok: true } | { ok: false; message: string } {
  const blocked = deletionBlockedBy(input.dependents);
  if (blocked) return { ok: false, message: blocked };
  if (input.status === "final" && !confirmationMatches(input.typedConfirmation)) {
    return {
      ok: false,
      message: `This is an issued record. Type ${DELETE_CONFIRMATION} to confirm you want it removed.`,
    };
  }
  return { ok: true };
}

/**
 * Whether a project may be deleted.
 *
 * A project owns everything under it, so nothing outside can be depending on
 * it and there is nothing to block on. What it does need is the typed
 * confirmation and the right project named, because this is the single most
 * destructive action in the product.
 */
export function canDeleteProject(input: {
  projectName: string;
  typedConfirmation: string;
}): { ok: true } | { ok: false; message: string } {
  if (!confirmationMatches(input.typedConfirmation)) {
    return {
      ok: false,
      message: `Type ${DELETE_CONFIRMATION} to confirm you want to remove ${input.projectName} and everything recorded against it.`,
    };
  }
  return { ok: true };
}
