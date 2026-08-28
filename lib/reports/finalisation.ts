/**
 * What "final" means, and what has to be true before a report can become it.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a database and read the same way from the action and the
 * screen.
 *
 * Finalising is the moment a working document becomes an issued record. After
 * it, the report and its PDF are a snapshot of what was said on that date and
 * are not edited again - a progress report that changes after it has been sent
 * is worth less than no report at all in a dispute. Corrections to an issued
 * report belong in a revision workflow (Rev 1, Rev 2, keeping the original),
 * which is deliberately not built yet.
 */

export type FinalisationInput = {
  status: "draft" | "final";
  rawNotes: string | null;
  sectionCount: number;
};

export type FinalisationCheck =
  | { ok: true }
  | { ok: false; reason: "already-final" | "no-content"; message: string };

/**
 * Whether this report can be issued.
 *
 * Deliberately thin. A site manager filing at five o'clock in the rain does
 * not need a validator telling him his weather field is empty - the only
 * things worth blocking on are a report that has already been issued, and one
 * with nothing in it at all, which would produce a PDF that says nothing while
 * looking official.
 */
export function canFinalise(input: FinalisationInput): FinalisationCheck {
  if (input.status === "final") {
    return {
      ok: false,
      reason: "already-final",
      message:
        "This report has already been finalised. Its PDF is the issued record and is not regenerated.",
    };
  }

  if (input.sectionCount === 0 && !input.rawNotes?.trim()) {
    return {
      ok: false,
      reason: "no-content",
      message:
        "There is nothing to issue yet. Add the day's work, and write the report, before finalising.",
    };
  }

  return { ok: true };
}

/**
 * The object name for a finalised report's PDF.
 *
 * Carries the report number so a downloaded file is identifiable in a folder
 * of them, and a timestamp so that a future revision workflow can add one
 * without colliding with what is already stored. The company and project
 * folders are prepended by the caller - storage policies match on the leading
 * folder, so that part is not this function's to invent.
 */
export function pdfFileName(reportNumber: number, finalisedAt: Date): string {
  const number = String(reportNumber).padStart(3, "0");
  const stamp = finalisedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `report-${number}-${stamp}.pdf`;
}
