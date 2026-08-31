/**
 * The unsent capture, kept on the phone until the server has it.
 *
 * Not an offline system. A capture still has to reach the server before it
 * counts, and nothing here ever tells anybody their words are saved. This is
 * the smaller promise underneath: a request that fails on one bar of signal, a
 * tab iOS discarded in the background, a browser closed on the way to the van -
 * and the sentence is still in the box when the screen comes back.
 *
 * A tiny store rather than component state, so the screen can read it with
 * `useSyncExternalStore`: that renders empty on the server, picks the stored
 * text up after hydration without a mismatch, and needs no effect writing state
 * on mount.
 *
 * Every access is wrapped. Safari in private mode throws on localStorage, and a
 * screen that will not open is worse than one that forgets.
 */

const KEY_PREFIX = "siteboss:capture:";

const listeners = new Set<() => void>();

/** Read the draft for one report. Empty string on the server, or with no store. */
export function readCaptureDraft(reportId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${reportId}`) ?? "";
  } catch {
    return "";
  }
}

/**
 * Keep what has been typed so far.
 *
 * Deliberately does not notify: the box already holds these words, and telling
 * it about them would rebuild it under the user's thumb mid-sentence.
 */
export function writeCaptureDraft(reportId: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) window.localStorage.setItem(`${KEY_PREFIX}${reportId}`, value);
    else window.localStorage.removeItem(`${KEY_PREFIX}${reportId}`);
  } catch {
    // No store. The box still holds the text while the screen is open.
  }
}

/**
 * The server has the capture. Only now may the local copy go.
 *
 * This one does notify, because the box has to come back empty for the next
 * thing somebody wants to say.
 */
export function clearCaptureDraft(reportId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${reportId}`);
  } catch {
    // Nothing to clear.
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore. Also listens to other tabs on the same phone. */
export function subscribeToCaptureDraft(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}
