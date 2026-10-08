/**
 * Prepare Daily, with whatever is still in the box added first.
 *
 * A worker speaks the last thing that happened and taps Prepare Daily without
 * tapping the arrow. Before this, those words were not in the report: Prepare
 * Daily read only the captures already on the server. Now the unsent text goes
 * through the same capture path the arrow uses, and only once the server has
 * confirmed it is the phone's copy cleared and the draft written.
 *
 * If that save fails, nothing is prepared. A Daily written without the last
 * thing said is an incomplete report that reads as complete, and the words are
 * still in the box for the person to try again.
 *
 * Pure, so the order - save, confirm, clear, prepare - is tested without a
 * browser or a server. The pieces are handed in: the capture action, the
 * prepare action, and the two store calls.
 */

export const UNSENT_NOT_SAVED =
  "The words still in the box could not be added, so today's Daily was not prepared. They are still there - check the signal and try again.";

export type PendingCapture = {
  /** What is in the box, as written. Whitespace alone is nothing to add. */
  text: string;
  /** The phone's clock, HH:MM, as the arrow would have stamped it. */
  at: string;
};

export type PendingOutcome<S> =
  | { kind: "prepared"; state: S }
  | { kind: "not_saved"; error: string };

/**
 * Save the unsent words, then prepare.
 *
 * `save` resolves to the capture's own result - `{ error }` or `{ savedAt }` -
 * and may reject when the server cannot be reached; a rejection counts as not
 * saved. `prepare` is the Prepare Daily action, called only when there was
 * nothing to add or the addition is confirmed.
 */
export async function saveUnsentThenPrepare<S>({
  pending,
  save,
  prepare,
  clearDraft,
  setBusy,
  describeFailure,
}: {
  pending: PendingCapture;
  save: (pending: PendingCapture) => Promise<{ error?: string }>;
  prepare: () => Promise<S>;
  clearDraft: () => void;
  setBusy: (value: boolean) => void;
  describeFailure: (cause: unknown) => string;
}): Promise<PendingOutcome<S>> {
  if (pending.text.trim()) {
    setBusy(true);
    try {
      const result = await save(pending);
      if (result.error) return { kind: "not_saved", error: `${UNSENT_NOT_SAVED} (${result.error})` };
    } catch (cause) {
      return { kind: "not_saved", error: `${UNSENT_NOT_SAVED} (${describeFailure(cause)})` };
    } finally {
      setBusy(false);
    }
    // Confirmed by the server, so the phone's copy may go. Doing this before
    // the prepare runs is what empties the box while the Daily is written,
    // and what stops the same words coming back if the prepare asks a question.
    clearDraft();
  }
  return { kind: "prepared", state: await prepare() };
}

/** The phone's clock as the capture log writes it: HH:MM. */
export function clockNow(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
