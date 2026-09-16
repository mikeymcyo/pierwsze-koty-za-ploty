/**
 * Drains the photo queue: one photograph at a time, oldest first, until
 * nothing is due or the signal is gone.
 *
 * Everything that touches a browser, a bucket or a server action is handed
 * in through `deps`, so the whole loop - the twenty-five photographs, the
 * page that dies mid-upload, the reply that never comes, the retry that must
 * not double anything - runs in Node against a fake store and a scripted
 * network. See e2e/photo-queue-smoke.mjs.
 *
 * No runtime imports beyond the pure queue module, for the same reason.
 */

import {
  afterFailure,
  nextToRun,
  reconcileAfterRestart,
  withTimeout,
  type QueuedPhoto,
} from "./photo-queue";

/** What the phone gives back: the stored photograph and its small copy. */
export type CompressedPhoto = { blob: Blob; width: number; height: number; thumb: Blob | null };

/** The queue, wherever it lives. IndexedDB on a phone; a Map in the tests. */
export type QueueStore = {
  list(): Promise<QueuedPhoto[]>;
  update(id: string, patch: Partial<QueuedPhoto>): Promise<void>;
  remove(id: string): Promise<void>;
};

export type RunnerDeps = {
  store: QueueStore;
  compress(file: Blob): Promise<CompressedPhoto>;
  /**
   * Writes the photograph and its thumbnail to the bucket at `record.path`.
   * Throws on failure. The signal is aborted when the step stalls.
   */
  upload(record: QueuedPhoto, compressed: CompressedPhoto, signal: AbortSignal): Promise<void>;
  /**
   * Creates the row. Resolves with an error string when the server refused
   * the photograph; throws when the server could not be reached.
   */
  attach(record: QueuedPhoto, compressed: CompressedPhoto): Promise<{ error?: string } | void>;
  online(): boolean;
  now(): number;
  timeoutMs: number;
  /** The row exists. Only now may a screen say Uploaded. */
  onUploaded?(record: QueuedPhoto): void;
  /** Something about a record changed; a screen may want to re-read the store. */
  onChange?(): void;
};

export type DrainOutcome = {
  uploaded: number;
  waiting: number;
  failed: number;
  /** True when the loop stopped because the phone is offline. */
  offline: boolean;
};

/**
 * One drain. Serialised by the caller - a Web Lock on a phone - so at most
 * one of these runs at a time across every tab SiteBoss is open in.
 *
 * The order of the steps is the safety contract:
 *
 *  1. the record is marked `uploading` (so a killed page leaves a trace that
 *     reconcileAfterRestart puts back in the queue);
 *  2. the bytes are compressed from the stored original, and the photograph
 *     and its thumbnail are written to the bucket at the record's own path;
 *  3. the row is attached, under the same deadline;
 *  4. only when the attach reply says the row exists is the record removed
 *     from the phone.
 *
 * A failure anywhere between 1 and 4 leaves the bytes where they were and
 * marks the record Waiting or Failed. Nothing is ever removed on the way in.
 */
export async function drainQueue(deps: RunnerDeps): Promise<DrainOutcome> {
  const outcome: DrainOutcome = { uploaded: 0, waiting: 0, failed: 0, offline: false };

  // Whatever a dead page left half-done goes back in the queue first.
  const stale = reconcileAfterRestart(await deps.store.list());
  for (const record of stale) {
    await deps.store.update(record.id, { status: "queued" });
  }
  if (stale.length) deps.onChange?.();

  for (;;) {
    if (!deps.online()) {
      outcome.offline = true;
      break;
    }

    const records = await deps.store.list();
    const next = nextToRun(records, deps.now());
    if (!next) break;

    await deps.store.update(next.id, { status: "uploading" });
    deps.onChange?.();

    try {
      const compressed = await deps.compress(next.file);
      await withTimeout((signal) => deps.upload(next, compressed, signal), deps.timeoutMs);
      const result = await withTimeout(() => deps.attach(next, compressed), deps.timeoutMs);
      if (result && result.error) throw new Error(result.error);

      // The row exists. This is the one place a photograph leaves the phone.
      await deps.store.remove(next.id);
      outcome.uploaded += 1;
      deps.onUploaded?.(next);
    } catch (cause) {
      const patch = afterFailure(next, cause, deps.now(), deps.online());
      await deps.store.update(next.id, patch);
      if (patch.status === "waiting") outcome.waiting += 1;
      else outcome.failed += 1;
    }
    deps.onChange?.();
  }

  return outcome;
}
