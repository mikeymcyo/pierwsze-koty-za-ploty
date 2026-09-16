/**
 * Where the queue lives on the phone: IndexedDB, with a small in-memory
 * mirror the screens read through useSyncExternalStore.
 *
 * Browser-only, and every browser call is wrapped: a phone with no
 * IndexedDB, a private tab, a full disk - none of them may stop a photograph
 * being chosen. What they do instead is leave the record `secured: false`,
 * held in memory here, and the screen says so in as many words.
 *
 * ## The one promise this file makes
 *
 * `securePhotos` resolves `secured: true` only after the write transaction
 * has fired `oncomplete` - the point at which the browser has committed the
 * bytes to disk. Not on `put`, not on the request's `onsuccess`, which fire
 * before the commit. "25 photos secured" on the screen means exactly that.
 *
 * The rest is bookkeeping: a mirror of the records for the screens, listeners
 * for React, a channel so a second tab sees the same list, and a note of
 * whether the browser agreed to keep the storage.
 */

import {
  isPending,
  targetKey,
  type QueuedPhoto,
} from "@/lib/photo-queue";
import type { QueueStore } from "@/lib/photo-queue-runner";

const DB_NAME = "siteboss-photo-queue";
const STORE = "photos";
const VERSION = 1;
const CHANNEL = "siteboss-photo-queue";

/** A photograph the server has confirmed. Shown as Uploaded for a moment, then it is just a photograph. */
export type UploadedNote = { id: string; name: string; target: string };

export type QueueSnapshot = {
  /** Every record the phone holds, secured or not. Oldest first. */
  records: QueuedPhoto[];
  /** Confirmed since the screen last cleared them. In memory only. */
  uploaded: UploadedNote[];
  /** Whether a drain is running in this tab. */
  draining: boolean;
  online: boolean;
  /** False until the first read of IndexedDB has answered, so nothing flashes. */
  loaded: boolean;
  /** Screens with their own list on show, by targetKey. The chip stays quiet about those. */
  visibleTargets: string[];
  /** What the browser said to navigator.storage.persist(): null until asked or where unsupported. */
  persistent: boolean | null;
};

const EMPTY: QueueSnapshot = {
  records: [],
  uploaded: [],
  draining: false,
  online: true,
  loaded: false,
  visibleTargets: [],
  persistent: null,
};

/** For the server render and the first client render: nothing yet. */
export function getServerQueueSnapshot(): QueueSnapshot {
  return EMPTY;
}

let snapshot: QueueSnapshot = EMPTY;
const listeners = new Set<() => void>();

/** Records the phone would not keep, in memory only. Keyed by id like the store. */
const volatile = new Map<string, QueuedPhoto>();

let dbPromise: Promise<IDBDatabase> | null = null;
let channel: BroadcastChannel | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function set(patch: Partial<QueueSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("This browser has no local database"));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch (cause) {
      reject(cause instanceof Error ? cause : new Error("The local database could not be opened"));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // If the database is deleted or upgraded underneath us, open it again next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("The local database could not be opened"));
    request.onblocked = () => reject(new Error("The local database is in use by another tab"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Runs one transaction and resolves only when it has committed. */
function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch (cause) {
          reject(cause instanceof Error ? cause : new Error("The local database refused"));
          return;
        }
        let result: T | undefined;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("The local database failed"));
        tx.onabort = () => reject(tx.error ?? new Error("The local database gave up"));
        const request = work(tx.objectStore(STORE));
        if (request) request.onsuccess = () => (result = request.result);
      }),
  );
}

async function readAll(): Promise<QueuedPhoto[]> {
  const stored = (await transact<QueuedPhoto[]>("readonly", (store) => store.getAll())) ?? [];
  return stored;
}

function merged(stored: QueuedPhoto[]): QueuedPhoto[] {
  const all = [...stored.map((record) => ({ ...record, secured: true })), ...volatile.values()];
  return all.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Re-reads the phone and tells every screen.
 *
 * A read that fails leaves the mirror showing what it showed before plus the
 * volatile records: a screen that cannot read the store must never look
 * emptier than the phone is.
 */
export async function refreshQueue(): Promise<QueuedPhoto[]> {
  let stored: QueuedPhoto[] = [];
  try {
    stored = await readAll();
  } catch {
    stored = snapshot.records.filter((record) => record.secured);
  }
  const records = merged(stored);
  set({ records, loaded: true });
  return records;
}

function broadcast(): void {
  try {
    channel?.postMessage("changed");
  } catch {
    // A closed channel. The other tab re-reads on its own triggers anyway.
  }
}

/**
 * Keeps every chosen photograph on the phone.
 *
 * One transaction for the whole selection: either all twenty-five are on
 * disk or the screen is told none are. Resolves after the commit, never
 * before. When the phone refuses, the records are kept in memory instead,
 * marked `secured: false`, and still uploaded - the queue just cannot
 * promise they survive the page.
 */
export async function securePhotos(
  records: QueuedPhoto[],
): Promise<{ secured: boolean; reason: string | null }> {
  let outcome: { secured: boolean; reason: string | null };
  try {
    await transact("readwrite", (store) => {
      for (const record of records) store.put({ ...record, secured: true });
    });
    outcome = { secured: true, reason: null };
  } catch (cause) {
    for (const record of records) volatile.set(record.id, { ...record, secured: false });
    outcome = {
      secured: false,
      reason: cause instanceof Error && cause.message ? cause.message : "no local storage",
    };
  }
  await refreshQueue();
  broadcast();
  return outcome;
}

/** The store the runner drains. Secured and volatile records alike. */
export const queueStore: QueueStore = {
  list: () => refreshQueue(),
  async update(id, patch) {
    const held = volatile.get(id);
    if (held) {
      volatile.set(id, { ...held, ...patch, secured: false });
    } else {
      await transact("readwrite", (store) => {
        const read = store.get(id);
        read.onsuccess = () => {
          const current = read.result as QueuedPhoto | undefined;
          if (current) store.put({ ...current, ...patch, secured: true });
        };
      });
    }
    await refreshQueue();
    broadcast();
  },
  async remove(id) {
    if (volatile.delete(id)) {
      await refreshQueue();
      broadcast();
      return;
    }
    await transact("readwrite", (store) => store.delete(id));
    await refreshQueue();
    broadcast();
  },
};

/** Failed → queued, so the next drain picks it up. */
export async function retryQueued(id: string): Promise<void> {
  await queueStore.update(id, { status: "queued", lastError: null, nextAttemptAt: 0 });
}

/** Discards a photograph that never uploaded. Asked for twice on the screen; this is the second time. */
export async function removeQueued(id: string): Promise<void> {
  await queueStore.remove(id);
}

export function markDraining(draining: boolean): void {
  if (snapshot.draining !== draining) set({ draining });
}

/** The server confirmed the row. Kept in memory so the screen can say Uploaded for a moment. */
export function noteUploaded(record: QueuedPhoto): void {
  set({
    uploaded: [
      ...snapshot.uploaded.filter((note) => note.id !== record.id),
      { id: record.id, name: record.name, target: targetKey(record) },
    ].slice(-100),
  });
}

/** Clears the Uploaded notes for one screen, once it has shown them. */
export function forgetUploaded(target: string): void {
  if (!snapshot.uploaded.some((note) => note.target === target)) return;
  set({ uploaded: snapshot.uploaded.filter((note) => note.target !== target) });
}

/**
 * A screen with its own list for `target` is on show.
 *
 * Returns the function that says it has gone. The app-wide chip counts only
 * photographs whose screen is not registered.
 */
export function registerVisibleTarget(target: string): () => void {
  set({ visibleTargets: [...snapshot.visibleTargets, target] });
  return () => {
    const index = snapshot.visibleTargets.indexOf(target);
    if (index === -1) return;
    const next = [...snapshot.visibleTargets];
    next.splice(index, 1);
    set({ visibleTargets: next });
  };
}

/**
 * Asks the browser to keep this origin's storage through pressure.
 *
 * Feature-detected and never assumed: Safari grants it to home-screen apps
 * and refuses it to tabs, Chrome decides by engagement, and a browser with
 * no such API answers null. Whatever it says is recorded, and nothing else
 * changes - the queue is written the same way either way.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (snapshot.persistent !== null) return snapshot.persistent;
  try {
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage || typeof storage.persist !== "function") return null;
    const granted = await storage.persist();
    set({ persistent: granted });
    return granted;
  } catch {
    return null;
  }
}

function onConnectivity(): void {
  set({ online: typeof navigator === "undefined" ? true : navigator.onLine !== false });
}

let started = false;

/** Wires the browser events once. Safe to call from every subscriber. */
function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", onConnectivity);
  window.addEventListener("offline", onConnectivity);
  onConnectivity();
  try {
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => void refreshQueue();
    }
  } catch {
    channel = null;
  }
  void refreshQueue();
}

/** For useSyncExternalStore. */
export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getQueueSnapshot(): QueueSnapshot {
  return snapshot;
}

/** The records for one screen, in the order they were chosen. */
export function recordsFor(records: QueuedPhoto[], target: string): QueuedPhoto[] {
  return records.filter((record) => targetKey(record) === target);
}

/** Pending records whose screen is not on show: what the app-wide chip counts. */
export function pendingElsewhere(snap: QueueSnapshot): QueuedPhoto[] {
  const visible = new Set(snap.visibleTargets);
  return snap.records.filter((record) => isPending(record) && !visible.has(targetKey(record)));
}
