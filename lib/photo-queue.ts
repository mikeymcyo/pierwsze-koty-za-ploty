/**
 * The photo upload queue: what is secured on the phone, what state each
 * photograph is in, and which one goes next.
 *
 * Pure, with no runtime imports and no path aliases, so every decision here
 * runs in Node against a fake store - the twenty-five-photographs-on-one-bar
 * scenarios in e2e/photo-queue-smoke.mjs are all driven through this module.
 *
 * ## What problem this is
 *
 * A photograph chosen on site used to live in React state until its row
 * existed: the picked file, the compressed bytes, the storage path, all in
 * memory. iOS freezes a locked or backgrounded page within seconds and
 * discards it under memory pressure, and twenty-five decoded photographs are
 * memory pressure. When the page came back, every photograph that had not
 * reached the database was gone, with nothing to say it had ever been chosen.
 * That is lost evidence, and the person holding the phone had no way to know.
 *
 * ## What is promised, and what is not
 *
 * The promise is narrower than "uploads in the background" and it is the one
 * a web app on an iPhone can actually keep:
 *
 *  - every chosen photograph is written to IndexedDB, with its storage path,
 *    before anything else happens to it, and the screen says "secured" only
 *    once that transaction has committed;
 *  - the queue is drained whenever SiteBoss is open: on launch, when the app
 *    comes back to the front, when the signal returns, and on a retry clock;
 *  - a photograph leaves the phone only after the server has confirmed its
 *    row, so a lost reply is retried onto the same object and never doubled.
 *
 * Nothing continues while the phone is locked. iOS offers no background sync
 * to a web page, and the notice the screen shows says so in as many words.
 *
 * ## The four states somebody sees
 *
 * Uploading, Waiting for signal, Uploaded, Failed. Underneath there is one
 * more - `queued`, chosen and secured but not yet attempted - which is shown
 * as Uploading whenever the phone is online, because it is about to be, and
 * as Waiting for signal when it is not. Nobody on site needs a fifth word.
 */

/** Where a photograph is in the queue. Never "uploaded": an uploaded photograph is removed. */
export type QueueStatus = "queued" | "uploading" | "waiting" | "failed";

/** One photograph secured on the phone, with everything a retry needs. */
export type QueuedPhoto = {
  id: string;
  companyId: string;
  projectId: string;
  reportId: string | null;
  summaryReportId: string | null;
  /** The status chosen at upload; a string here so the module stays free of app types. */
  category: string;
  /**
   * Minted once, when the file was chosen, and never again. Every attempt
   * writes this object and attaches this path, which is what lets the server
   * refuse a second row for a photograph it already has.
   */
  path: string;
  name: string;
  type: string;
  /** The original bytes. Compression happens at upload, from these, every time. */
  file: Blob;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  /** Epoch milliseconds before which a waiting photograph is not retried. */
  nextAttemptAt: number;
  createdAt: number;
  /**
   * False when the phone would not keep it - no IndexedDB, or a full one -
   * and the bytes are held in memory only. The screen says so plainly.
   */
  secured: boolean;
};

/** The words on the screen. Exactly these four. */
export const UPLOAD_STATE_LABELS = {
  uploading: "Uploading",
  waiting: "Waiting for signal",
  uploaded: "Uploaded",
  failed: "Failed",
} as const;

export type UploadState = keyof typeof UPLOAD_STATE_LABELS;

/**
 * What the screen says while anything is pending. Never claims the phone
 * keeps uploading with the screen off, because it does not.
 */
export const KEEP_OPEN_NOTICE =
  "Keep SiteBoss open to finish uploading. If you leave or lock your phone, your secured photos will continue next time you open SiteBoss.";

/** How long one network step may take before it is treated as stalled. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** Retries are capped here; the `online` event and reopening the app come sooner anyway. */
export const MAX_BACKOFF_MS = 60_000;

/**
 * How many photographs are worked at once.
 *
 * Two, measured rather than guessed: the phone compresses on its one main
 * thread, so a second worker buys nothing there, but while one photograph's
 * bytes are on the wire the next can be compressed and the row for the last
 * attached. More than two only queues requests behind each other on one
 * radio and makes the first photograph appear later, not sooner.
 */
export const UPLOAD_CONCURRENCY = 2;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function securingLabel(count: number): string {
  return `Securing ${plural(count, "photo")}…`;
}

export function securedLabel(count: number): string {
  return `${plural(count, "photo")} secured · uploading…`;
}

/** The honest version, for a phone that would not keep the bytes. */
export function notSecuredLabel(count: number, reason?: string | null): string {
  const head = `${plural(count, "photo")} could NOT be secured on this phone${
    reason ? ` (${reason})` : ""
  }. They will upload only while this screen stays open - do not leave it until they have.`;
  return head;
}

export function waitingLabel(count: number): string {
  return `${plural(count, "photo")} waiting to upload`;
}

/** The kind of failure, which decides the next state. */
export type FailureKind = "network" | "rejected";

/**
 * Thrown before compression when the bytes a record points at cannot be read.
 *
 * On an iPhone a File from the picker is a reference to a temporary file, and
 * IndexedDB used to keep that reference rather than the bytes; once iOS had
 * cleared the picker's copy every read failed as "Load failed", which read as
 * a network fault and was retried for days. The bytes are copied at securing
 * now, so this should not happen again - but if it ever does, it is not the
 * network's fault and it is not retried: the person is told to choose the
 * photograph again.
 */
export class UnreadablePhoto extends Error {
  constructor() {
    super("This photo is no longer on the phone. Please choose it again.");
    this.name = "UnreadablePhoto";
  }
}

/** Thrown by withTimeout when a step has gone quiet for too long. */
export class StalledRequest extends Error {
  constructor(ms: number) {
    super(`No response after ${Math.round(ms / 1000)} seconds`);
    this.name = "StalledRequest";
  }
}

/**
 * Anything the network might say when it is the network's fault. Safari says
 * "Load failed", Chrome "Failed to fetch", an abort says "aborted", a gateway
 * says 502 or 503, and a stalled request says what StalledRequest says.
 */
const NETWORK_WORDS =
  /\b(fetch|network|load failed|timed? ?out|abort|socket|connection|offline|unreachable|gateway|no response|temporarily)|\b50[234]\b/i;

/**
 * Decides whether a failure is worth waiting out or needs a person.
 *
 * Offline, a stalled request, a 5xx or anything worded like a network fault
 * is `network`: the photograph goes back to Waiting for signal and is retried
 * on its own. Everything else - an issued report, a refused path, a file the
 * bucket will not take - is `rejected`: it stays put as Failed until somebody
 * presses Retry or Remove, because retrying it alone would fail the same way.
 */
export function classifyFailure(cause: unknown, online = true): FailureKind {
  if (!online) return "network";
  if (cause instanceof StalledRequest) return "network";
  if (cause instanceof UnreadablePhoto) return "rejected";

  const status = statusOf(cause);
  if (status !== null) return status >= 500 ? "network" : "rejected";

  const message = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause ?? "");
  return NETWORK_WORDS.test(message) ? "network" : "rejected";
}

function statusOf(cause: unknown): number | null {
  if (!cause || typeof cause !== "object") return null;
  const raw =
    (cause as { statusCode?: unknown }).statusCode ?? (cause as { status?: unknown }).status;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value >= 100 ? value : null;
}

/** 2s, 4s, 8s ... capped, so a dead spot is polled gently rather than hammered. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * What a failed attempt turns the photograph into.
 *
 * The attempt count rises either way, so the wait grows on a long dead spot.
 * A rejection keeps its message; a network fault keeps none, because "Load
 * failed" tells a site manager nothing that "Waiting for signal" does not.
 */
export function afterFailure(
  record: QueuedPhoto,
  cause: unknown,
  now: number,
  online = true,
): Pick<QueuedPhoto, "status" | "attempts" | "lastError" | "nextAttemptAt"> {
  const attempts = record.attempts + 1;
  if (classifyFailure(cause, online) === "network") {
    return { status: "waiting", attempts, lastError: null, nextAttemptAt: now + backoffMs(attempts) };
  }
  const message = cause instanceof Error ? cause.message : String(cause ?? "Upload failed");
  return { status: "failed", attempts, lastError: message, nextAttemptAt: 0 };
}

/**
 * A photograph left as `uploading` by a page that died mid-attempt.
 *
 * Nothing is uploading when a drain starts - the lock guarantees that - so
 * every such record is a stale one and goes back to the front of the queue.
 * Its object may already be in the bucket, which is fine: the retry writes
 * the same path, and the server attaches it once.
 */
export function reconcileAfterRestart(records: QueuedPhoto[]): QueuedPhoto[] {
  return records.filter((record) => record.status === "uploading");
}

/** Oldest first; ids break the tie so two records chosen together keep their order. */
function byAge(a: QueuedPhoto, b: QueuedPhoto): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The photograph to attempt now, or null when nothing is due. */
export function nextToRun(records: QueuedPhoto[], now: number): QueuedPhoto | null {
  const due = records
    .filter(
      (record) =>
        record.status === "queued" || (record.status === "waiting" && record.nextAttemptAt <= now),
    )
    .sort(byAge);
  return due[0] ?? null;
}

/** When the next waiting photograph becomes due, or null if none is waiting. */
export function nextRetryAt(records: QueuedPhoto[]): number | null {
  let earliest: number | null = null;
  for (const record of records) {
    if (record.status !== "waiting") continue;
    if (earliest === null || record.nextAttemptAt < earliest) earliest = record.nextAttemptAt;
  }
  return earliest;
}

/** Still to be uploaded: everything that is not a failure needing a person. */
export function isPending(record: QueuedPhoto): boolean {
  return record.status !== "failed";
}

export function countPending(records: QueuedPhoto[]): number {
  return records.filter(isPending).length;
}

/**
 * The state a photograph is shown in.
 *
 * `queued` is shown as Uploading whenever the phone is online - it is about
 * to be attempted - and as Waiting for signal when the phone is offline. A
 * `waiting` one is backing off after a network fault; it reads as Uploading
 * only while a drain is actually running.
 */
export function displayState(record: QueuedPhoto, online: boolean, draining: boolean): UploadState {
  if (record.status === "failed") return "failed";
  if (!online) return "waiting";
  if (record.status === "uploading") return "uploading";
  if (record.status === "waiting") return draining ? "uploading" : "waiting";
  // Queued and online: it is about to be attempted, whether or not the
  // runner has picked it up in the last few milliseconds.
  return "uploading";
}

/**
 * The line above the list: one sentence for the whole batch.
 *
 * "Uploading · 22 to go" while it is moving, "Waiting for signal · 22 to go"
 * while it is not, "3 failed" when only failures are left, and nothing at all
 * when the queue is empty - which is the only time nothing is said.
 */
export function summariseQueue(
  records: QueuedPhoto[],
  online: boolean,
  draining: boolean,
): { state: UploadState; text: string } | null {
  const pending = records.filter(isPending);
  const failed = records.length - pending.length;

  if (pending.length > 0) {
    // Moving: a drain is running, or something is queued and online and so
    // about to be. Only a queue made entirely of photographs backing off
    // after a fault - or an offline phone - is Waiting for signal.
    const moving =
      online && (draining || pending.some((record) => record.status !== "waiting"));
    const state: UploadState = moving ? "uploading" : "waiting";
    const tail = failed > 0 ? ` · ${plural(failed, "failure")}` : "";
    return {
      state,
      text: `${UPLOAD_STATE_LABELS[state]} · ${pending.length} to go${tail}`,
    };
  }
  if (failed > 0) return { state: "failed", text: `${plural(failed, "photo")} failed` };
  return null;
}

/**
 * Which screen a photograph belongs to.
 *
 * The same key is registered by the upload control while it is on screen, so
 * the app-wide "3 photos waiting to upload" chip can stay quiet about the
 * photographs whose own list is already in front of the person.
 */
export function targetKey(record: Pick<QueuedPhoto, "reportId" | "summaryReportId" | "projectId">): string {
  if (record.summaryReportId) return `summary:${record.summaryReportId}`;
  if (record.reportId) return `report:${record.reportId}`;
  return `project:${record.projectId}`;
}

/** Where the chip sends somebody: the screen the photographs were chosen on. */
export function targetHref(record: Pick<QueuedPhoto, "reportId" | "summaryReportId" | "projectId">): string {
  if (record.summaryReportId) return `/summary-reports/${record.summaryReportId}`;
  if (record.reportId) return `/reports/${record.reportId}`;
  return `/projects/${record.projectId}`;
}

/**
 * Runs one step with a deadline.
 *
 * The signal is aborted at the deadline so a request that will never answer
 * stops holding its socket, and the step rejects with StalledRequest - which
 * classifyFailure reads as a network fault. A reply that arrives after the
 * deadline is simply ignored: the object it wrote is at the same path the
 * retry will write, and the row it made is the one the retry will find.
 */
export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new StalledRequest(ms));
    }, ms);
    run(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}
