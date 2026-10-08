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
 * The store is also where the composer and Prepare Daily meet. The box is
 * controlled from the value here, so whatever is in it - typed or spoken - is
 * what Prepare Daily reads when it adds the unsent words before drafting, and
 * `busy` is how each of them knows the other is mid-request.
 *
 * Every access is wrapped. Safari in private mode throws on localStorage, and a
 * screen that will not open is worse than one that forgets.
 */

const KEY_PREFIX = "siteboss:capture:";

const listeners = new Set<() => void>();

/**
 * The live text of each report's box.
 *
 * Filled from the phone's store the first time a screen asks, then moved by
 * every keystroke and every dictated chunk. The box is controlled from it, so
 * a re-render of the page - a photograph landing, a document being adopted -
 * leaves the box exactly as it was: nothing is keyed on this, so nothing is
 * remounted and a dictation in progress is never aborted.
 */
const live = new Map<string, string>();

/** Which reports have a capture or a Prepare Daily in flight right now. */
const busy = new Map<string, boolean>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readStored(reportId: string): string {
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${reportId}`) ?? "";
  } catch {
    return "";
  }
}

/** Read the draft for one report. Empty string on the server, or with no store. */
export function readCaptureDraft(reportId: string): string {
  if (typeof window === "undefined") return "";
  const held = live.get(reportId);
  if (held !== undefined) return held;
  const stored = readStored(reportId);
  live.set(reportId, stored);
  return stored;
}

/**
 * Keep what has been said or typed so far.
 *
 * The box shows exactly this value, so it is kept as written - whitespace and
 * all - while the phone's copy is only kept when there is a word in it.
 */
export function writeCaptureDraft(reportId: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) window.localStorage.setItem(`${KEY_PREFIX}${reportId}`, value);
    else window.localStorage.removeItem(`${KEY_PREFIX}${reportId}`);
  } catch {
    // No store. The box still holds the text while the screen is open.
  }
  if (live.get(reportId) === value) return;
  live.set(reportId, value);
  notify();
}

/**
 * The server has the capture. Only now may the local copy go.
 *
 * This is what empties the box for the next thing somebody wants to say.
 */
export function clearCaptureDraft(reportId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${reportId}`);
  } catch {
    // Nothing to clear.
  }
  live.set(reportId, "");
  notify();
}

/** Whether a capture or a Prepare Daily for this report is mid-request. */
export function readCaptureBusy(reportId: string): boolean {
  return busy.get(reportId) === true;
}

/**
 * Mark a request in flight, or over.
 *
 * The arrow goes dead while Prepare Daily is adding the unsent words, and
 * Prepare Daily goes dead while the arrow's capture is on its way: two
 * requests appending to the same day at once is what the server's retry is
 * for, and two from the same thumb is what this is for.
 */
export function setCaptureBusy(reportId: string, value: boolean): void {
  if (readCaptureBusy(reportId) === value) return;
  if (value) busy.set(reportId, true);
  else busy.delete(reportId);
  notify();
}

/**
 * Another tab on the same phone wrote or cleared a draft: take its value.
 *
 * Only a change to one of these keys counts; the appearance settings live in
 * the same store and must not touch the capture box.
 */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && !event.key.startsWith(KEY_PREFIX)) return;
  if (event.key === null) live.clear();
  else live.set(event.key.slice(KEY_PREFIX.length), event.newValue ?? "");
  notify();
}

/** For useSyncExternalStore. Also listens to other tabs on the same phone. */
export function subscribeToCaptureDraft(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Test seam: forget what every screen was handed, and every busy flag. */
export function resetCaptureDraftSnapshots(): void {
  live.clear();
  busy.clear();
}
