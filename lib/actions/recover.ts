/**
 * A server action that cannot be reached is an error on the screen, not a
 * crash of the screen.
 *
 * `useActionState` hands a rejected action promise to React, which throws it
 * to the nearest error boundary. The only boundary used to be the root one,
 * so a request that failed on one bar of signal - or a function the platform
 * killed mid-write - replaced the whole page, and every word typed into the
 * form went with it. The bytes were never sent and never saved, and nothing
 * on the phone still had them.
 *
 * `recoverable` wraps an action so that a failure to reach or run it resolves
 * to the form's own error state instead of rejecting. The form stays mounted,
 * its fields keep their text, and the person reads one line and tries again
 * when the signal is back. Pure, with no runtime imports, so the wording and
 * the wrapping are tested directly.
 */

export const ACTION_UNREACHABLE =
  "SiteBoss could not be reached. Nothing was saved and your text is still here - check the signal and try again.";

export const ACTION_FAILED =
  "That could not be saved just now. Your text is still here - try again in a moment.";

const NETWORK_WORDS = /fetch|network|load failed|connection|offline|timed? ?out|abort|socket/i;

/** One sentence for the form, chosen by what went wrong. */
export function describeActionFailure(cause: unknown): string {
  const message = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause ?? "");
  return NETWORK_WORDS.test(message) ? ACTION_UNREACHABLE : ACTION_FAILED;
}

/**
 * The same action, but one that never rejects.
 *
 * A rejection becomes `{ ...previous, error }`: the previous state is kept so
 * a form that shows, say, a saved timestamp does not lose it, and `error` is
 * the one line the form already knows how to show.
 */
export function recoverable<S extends { error?: string }, P extends unknown[]>(
  action: (previous: S, ...args: P) => Promise<S>,
): (previous: S, ...args: P) => Promise<S> {
  return async (previous, ...args) => {
    try {
      return await action(previous, ...args);
    } catch (cause) {
      // A redirect or a not-found is not a failure: Next signals both by
      // throwing, and swallowing them would leave a saved form on the screen.
      if (isNextSignal(cause)) throw cause;
      return { ...previous, error: describeActionFailure(cause) };
    }
  };
}

/** Next's redirect() and notFound() travel as thrown errors with a digest. */
function isNextSignal(cause: unknown): boolean {
  const digest = (cause as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(digest);
}
