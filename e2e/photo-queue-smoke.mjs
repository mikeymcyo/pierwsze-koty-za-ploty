/**
 * The photo queue on one bar of signal.
 *
 * Twenty-five photographs chosen on site, an upload interrupted after a few,
 * a page that dies mid-upload, a signal that goes and comes back, a reply
 * that never arrives, a phone that will not keep the bytes. The whole loop -
 * lib/photo-queue.ts and lib/photo-queue-runner.ts - runs here in Node
 * against a fake store and a scripted network, because the promises it makes
 * are the kind that have to be proved rather than read:
 *
 *   - nothing chosen is ever lost from the queue except by a person's hand;
 *   - a photograph leaves the phone only after the server confirmed its row;
 *   - the storage path never changes between attempts;
 *   - a retry never makes a second row;
 *   - a stalled request becomes Waiting for signal, not a hang;
 *   - a rejection stays Failed until Retry or Remove.
 *
 * Needs no Supabase, no dev server, no browser:
 *
 *   npm run test:photo-queue
 */

import { readFileSync, readdirSync } from "node:fs";

import {
  KEEP_OPEN_NOTICE,
  StalledRequest,
  UPLOAD_CONCURRENCY,
  UnreadablePhoto,
  UPLOAD_STATE_LABELS,
  UPLOAD_TIMEOUT_MS,
  afterFailure,
  backoffMs,
  classifyFailure,
  countPending,
  displayState,
  nextRetryAt,
  nextToRun,
  notSecuredLabel,
  reconcileAfterRestart,
  securedLabel,
  securingLabel,
  summariseQueue,
  targetHref,
  targetKey,
  waitingLabel,
  withTimeout,
} from "../lib/photo-queue.ts";
import { drainQueue } from "../lib/photo-queue-runner.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// A phone, a bucket and a server, all scripted.
// ---------------------------------------------------------------------------

/** IndexedDB stand-in: a Map, with the same three operations and the same "nothing removed on the way in" property. */
function memoryStore(initial = []) {
  const rows = new Map(initial.map((record) => [record.id, { ...record }]));
  const log = [];
  return {
    rows,
    log,
    async list() {
      return [...rows.values()].map((record) => ({ ...record }));
    },
    async update(id, patch) {
      const current = rows.get(id);
      if (current) rows.set(id, { ...current, ...patch });
      log.push(["update", id, patch.status ?? null]);
    },
    async remove(id) {
      rows.delete(id);
      log.push(["remove", id]);
    },
  };
}

let clock = 1_000_000;
const now = () => clock;

function record(index, overrides = {}) {
  const id = `photo-${String(index).padStart(2, "0")}`;
  return {
    id,
    companyId: "company-1",
    projectId: "project-1",
    reportId: "report-1",
    summaryReportId: null,
    category: "general",
    path: `company-1/project-1/${id}-path.jpg`,
    name: `IMG_${index}.jpg`,
    type: "image/jpeg",
    file: new Blob([`bytes of ${id}`], { type: "image/jpeg" }),
    status: "queued",
    attempts: 0,
    lastError: null,
    nextAttemptAt: 0,
    createdAt: 1_000 + index,
    secured: true,
    ...overrides,
  };
}

const twentyFive = () => Array.from({ length: 25 }, (_, i) => record(i + 1));

/**
 * The bucket and the photos table, with the same rule the real server has:
 * one row per storage path, however many times it is attached.
 */
function server() {
  const objects = new Map();
  const rows = new Map();
  return {
    objects,
    rows,
    uploads: 0,
    attaches: 0,
    async upload(rec, compressed) {
      this.uploads += 1;
      objects.set(rec.path, compressed.blob);
    },
    async attach(rec) {
      this.attaches += 1;
      if (!objects.has(rec.path)) return { error: "That photo could not be attached - please try again." };
      if (!rows.has(rec.path)) rows.set(rec.path, { id: `row-${rows.size + 1}`, path: rec.path });
      return {};
    },
  };
}

const compress = async (file) => ({ blob: file, width: 1600, height: 1200, thumb: null });

function deps(store, srv, overrides = {}) {
  return {
    store,
    compress,
    upload: (rec, compressed, signal) => srv.upload(rec, compressed, signal),
    attach: (rec, compressed) => srv.attach(rec, compressed),
    online: () => true,
    now,
    timeoutMs: 200,
    ...overrides,
  };
}

const networkDown = () => {
  throw new TypeError("Load failed");
};

// ---------------------------------------------------------------------------

console.log("\n1. The words");

check("securing says how many", securingLabel(25) === "Securing 25 photos…");
check("secured says so and that uploading follows", securedLabel(25) === "25 photos secured · uploading…");
check("one photo is singular", securingLabel(1) === "Securing 1 photo…" && securedLabel(1) === "1 photo secured · uploading…");
check(
  "a phone that would not keep them is told in capitals",
  /NOT be secured/.test(notSecuredLabel(3, "QuotaExceededError")) && /QuotaExceededError/.test(notSecuredLabel(3, "QuotaExceededError")),
);
check("the app-wide chip", waitingLabel(3) === "3 photos waiting to upload" && waitingLabel(1) === "1 photo waiting to upload");
check(
  "exactly four states",
  Object.keys(UPLOAD_STATE_LABELS).join() === "uploading,waiting,uploaded,failed" &&
    UPLOAD_STATE_LABELS.waiting === "Waiting for signal",
);
check(
  "the honest lock notice, word for word",
  KEEP_OPEN_NOTICE ===
    "Keep SiteBoss open to finish uploading. If you leave or lock your phone, your secured photos will continue next time you open SiteBoss.",
);
check("and it never claims background uploading", !/background|while locked|keeps uploading/i.test(KEEP_OPEN_NOTICE));
check("a stalled request has a deadline of a minute", UPLOAD_TIMEOUT_MS === 60_000);

console.log("\n2. What kind of failure it was");

check("offline is the network's", classifyFailure(new Error("anything"), false) === "network");
check("Safari's 'Load failed' is the network's", classifyFailure(new TypeError("Load failed")) === "network");
check("Chrome's 'Failed to fetch' too", classifyFailure(new TypeError("Failed to fetch")) === "network");
check("a stalled request too", classifyFailure(new StalledRequest(60_000)) === "network");
check("an abort too", classifyFailure(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })) === "network");
check("a gateway 503 too", classifyFailure(Object.assign(new Error("Service Unavailable"), { statusCode: "503" })) === "network");
check("an issued report is a rejection", classifyFailure(new Error("This report has been issued and can no longer be changed.")) === "rejected");
check("a refused path is a rejection", classifyFailure(new Error("That photo could not be attached - please try again.")) === "rejected");
check("a 413 from the bucket is a rejection", classifyFailure(Object.assign(new Error("Payload too large"), { statusCode: 413 })) === "rejected");
check("a photograph whose bytes cannot be read is a rejection, never a network fault", classifyFailure(new UnreadablePhoto()) === "rejected" && /choose it again/i.test(new UnreadablePhoto().message));
check("a 403 from the bucket is a rejection", classifyFailure(Object.assign(new Error("new row violates row-level security policy"), { statusCode: "403" })) === "rejected");
check("backoff doubles from two seconds", [1, 2, 3, 4, 5, 6, 9].map(backoffMs).join() === "2000,4000,8000,16000,32000,60000,60000");

const waited = afterFailure(record(1), new TypeError("Load failed"), 5_000);
check("a network fault becomes Waiting with a retry time", waited.status === "waiting" && waited.nextAttemptAt === 7_000 && waited.attempts === 1);
check("and carries no message, because 'Load failed' helps nobody", waited.lastError === null);
const refused = afterFailure(record(1, { attempts: 2 }), new Error("This report has been issued."), 5_000);
check("a rejection becomes Failed with its reason", refused.status === "failed" && refused.lastError === "This report has been issued." && refused.attempts === 3);

console.log("\n3. Which photograph goes next");

const mixed = [
  record(3, { status: "waiting", nextAttemptAt: 2_000 }),
  record(1, { status: "failed" }),
  record(2, { status: "queued" }),
  record(4, { status: "waiting", nextAttemptAt: 9_000 }),
];
check("the oldest queued photograph", nextToRun(mixed, 1_000)?.id === "photo-02");
check("a waiting one whose time has come is a candidate too", nextToRun(mixed.filter((r) => r.id !== "photo-02"), 2_500)?.id === "photo-03");
check("but not before its time", nextToRun(mixed.filter((r) => r.id !== "photo-02"), 1_500) === null);
check("a failed one is never picked on its own", nextToRun([record(1, { status: "failed" })], 99_999) === null);
check("the next retry time is the earliest waiting one", nextRetryAt(mixed) === 2_000 && nextRetryAt([record(1)]) === null);
check("pending counts everything but failures", countPending(mixed) === 3);
check("a dead page's 'uploading' records are found", reconcileAfterRestart([record(1, { status: "uploading" }), record(2)]).map((r) => r.id).join() === "photo-01");

console.log("\n4. What the screen shows");

check("queued shows as Uploading while draining", displayState(record(1), true, true) === "uploading");
check("and as Uploading between drains too, because it is about to be", displayState(record(1), true, false) === "uploading");
check("a photograph backing off after a fault is Waiting for signal", displayState(record(1, { status: "waiting" }), true, false) === "waiting");
check("everything is Waiting for signal offline", displayState(record(1, { status: "uploading" }), false, true) === "waiting");
check("failed is Failed whatever else is true", displayState(record(1, { status: "failed" }), false, true) === "failed");
check("an empty queue says nothing at all", summariseQueue([], true, true) === null);
check("uploading says how many are to go", summariseQueue(twentyFive(), true, true)?.text === "Uploading · 25 to go");
check("offline it waits for signal", summariseQueue(twentyFive(), false, false)?.text === "Waiting for signal · 25 to go");
check("freshly secured and online it is Uploading even before the runner wakes", summariseQueue(twentyFive(), true, false)?.text === "Uploading · 25 to go");
check("a queue of photographs all backing off is Waiting for signal", summariseQueue(twentyFive().map((r) => ({ ...r, status: "waiting", nextAttemptAt: 9e12 })), true, false)?.text === "Waiting for signal · 25 to go");
check("failures ride along on the line", summariseQueue([record(1), record(2, { status: "failed" })], true, true)?.text === "Uploading · 1 to go · 1 failure");
check("only failures left says so", summariseQueue([record(2, { status: "failed" })], true, false)?.text === "1 photo failed");
check("a survey photograph belongs to its survey", targetKey(record(1, { summaryReportId: "s1" })) === "summary:s1" && targetHref(record(1, { summaryReportId: "s1" })) === "/summary-reports/s1");
check("a report photograph to its report", targetKey(record(1)) === "report:report-1" && targetHref(record(1)) === "/reports/report-1");
check("a project photograph to its project", targetKey(record(1, { reportId: null })) === "project:project-1" && targetHref(record(1, { reportId: null })) === "/projects/project-1");

console.log("\nA. Twenty-five chosen, the connection dies after ten");

{
  const store = memoryStore(twentyFive());
  const srv = server();
  let sent = 0;
  const outcome = await drainQueue(
    deps(store, srv, {
      upload: async (rec, compressed) => {
        if (sent >= 10) networkDown();
        sent += 1;
        await srv.upload(rec, compressed);
      },
    }),
  );
  check("ten uploaded, fifteen waiting, none failed, none lost", outcome.uploaded === 10 && outcome.waiting === 15 && outcome.failed === 0 && store.rows.size === 15);
  check("ten rows on the server, no more", srv.rows.size === 10);
  check("the fifteen are Waiting for signal with their bytes", [...store.rows.values()].every((r) => r.status === "waiting" && r.file.size > 0));
  check("in the order they were chosen", [...store.rows.keys()].join() === twentyFive().slice(10).map((r) => r.id).join());
  check("the screen says so", summariseQueue([...store.rows.values()], true, false)?.text === "Waiting for signal · 15 to go");
  check("and the chip elsewhere says so", waitingLabel(countPending([...store.rows.values()])) === "15 photos waiting to upload");
}

console.log("\nB, C, H. Navigate away, reload, or have iOS kill the page: the store is the queue");

{
  // A page dies with photo-03 marked uploading and its object already in the bucket but no row.
  const initial = twentyFive().slice(0, 5);
  initial[2].status = "uploading";
  const store = memoryStore(initial);
  const srv = server();
  srv.objects.set(initial[2].path, new Blob(["left behind"]));
  // A fresh runner over the same store - which is exactly what a reload or a relaunch is.
  const outcome = await drainQueue(deps(store, srv));
  check("the half-done photograph went back in the queue rather than being lost", store.log.some(([op, id, status]) => op === "update" && id === "photo-03" && status === "queued"));
  check("everything uploaded, nothing failed", outcome.uploaded === 5 && outcome.failed === 0 && store.rows.size === 0);
  check("the leftover object was overwritten at the same path, not a second one made", srv.objects.size === 5 && srv.objects.has(initial[2].path));
  check("five rows, no duplicate for the photograph the dead page had started", srv.rows.size === 5);
}

console.log("\nD, E, F. Offline, then the signal returns, then the rest resume");

{
  const store = memoryStore(twentyFive());
  const srv = server();
  let online = false;
  const d = deps(store, srv, { online: () => online });
  const first = await drainQueue(d);
  check("offline, the drain stops at once and attempts nothing", first.offline && first.uploaded === 0 && srv.uploads === 0);
  check("every photograph still queued and secured", store.rows.size === 25 && [...store.rows.values()].every((r) => r.status === "queued"));
  check("shown as Waiting for signal", summariseQueue([...store.rows.values()], false, false)?.state === "waiting");

  // Signal comes back mid-way and goes again: waiting with backoff, not failed.
  let calls = 0;
  online = true;
  const second = await drainQueue(
    deps(store, srv, {
      online: () => online,
      upload: async (rec, compressed) => {
        calls += 1;
        if (calls > 7) networkDown();
        await srv.upload(rec, compressed);
      },
    }),
  );
  check("seven landed before the signal went again", second.uploaded === 7 && srv.rows.size === 7);
  check("the rest are waiting, none failed", second.waiting === 18 && second.failed === 0);
  const retryAt = nextRetryAt([...store.rows.values()]);
  check("with a retry time two seconds out", retryAt === now() + 2_000, String(retryAt - now()));
  check("nothing is due until then", nextToRun([...store.rows.values()], now()) === null);

  clock += 2_000;
  const third = await drainQueue(deps(store, srv, { online: () => online }));
  check("when the time comes the remaining eighteen resume", third.uploaded === 18 && store.rows.size === 0);
  check("twenty-five rows, every path attached exactly once", srv.rows.size === 25 && srv.attaches === 25);
}

console.log("\nG. Retries never duplicate: same path, one row");

{
  // The attach succeeded on the server but the reply was lost: the record is retried.
  const store = memoryStore([record(1)]);
  const srv = server();
  let replies = 0;
  const flaky = deps(store, srv, {
    attach: async (rec, compressed) => {
      const result = await srv.attach(rec, compressed);
      replies += 1;
      if (replies === 1) throw new TypeError("Failed to fetch");
      return result;
    },
  });
  const first = await drainQueue(flaky);
  check("the lost reply leaves the photograph waiting, not gone", first.waiting === 1 && store.rows.size === 1);
  check("and the row already exists on the server", srv.rows.size === 1);
  const pathBefore = [...store.rows.values()][0].path;
  clock += 2_000;
  const second = await drainQueue(flaky);
  check("the retry attaches the same path", [...srv.rows.keys()][0] === pathBefore);
  check("the server answers 'already attached' and the photograph leaves the phone", second.uploaded === 1 && store.rows.size === 0);
  check("still exactly one row", srv.rows.size === 1 && srv.attaches === 2);
  check("and the bucket holds one object at that path", srv.objects.size === 1);
}

{
  // Retry pressed on a failed photograph: back in the queue, same path, then one row.
  const failedRecord = record(9, { status: "failed", lastError: "refused once", attempts: 1 });
  const store = memoryStore([failedRecord]);
  const srv = server();
  const untouched = await drainQueue(deps(store, srv));
  check("a failed photograph is left alone until somebody presses Retry", untouched.uploaded === 0 && store.rows.size === 1);
  await store.update(failedRecord.id, { status: "queued", lastError: null, nextAttemptAt: 0 });
  const retried = await drainQueue(deps(store, srv));
  check("Retry puts it through on the path it always had", retried.uploaded === 1 && [...srv.rows.keys()][0] === failedRecord.path);
}

console.log("\nI. The phone will not keep the bytes");

{
  // A record the store refused: secured: false, in memory only. The runner treats it like any other.
  const store = memoryStore([record(1, { secured: false })]);
  const srv = server();
  const outcome = await drainQueue(deps(store, srv));
  check("an unsecured photograph is still uploaded while the screen is open", outcome.uploaded === 1 && srv.rows.size === 1);
  check("and the screen names the danger while it is there", /could NOT be secured on this phone/.test(notSecuredLabel(1, "QuotaExceededError")));
  check(
    "the store keeps refused records in memory rather than dropping them",
    /volatile\.set\(record\.id, \{ \.\.\.record, secured: false \}\)/.test(read("../lib/photo-queue-store.ts")),
  );
}

console.log("\nJ. A request that never answers");

{
  const store = memoryStore([record(1), record(2)]);
  const srv = server();
  let aborted = null;
  const stalled = deps(store, srv, {
    timeoutMs: 40,
    upload: (rec, compressed, signal) =>
      rec.id === "photo-01" && rec.attempts === 0
        ? new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted = rec.id;
              reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
            });
          })
        : srv.upload(rec, compressed),
  });
  const started = Date.now();
  const outcome = await drainQueue(stalled);
  const took = Date.now() - started;
  check("the stalled photograph is abandoned at the deadline, not waited on for ever", took < 1_000, `${took}ms`);
  check("its socket is actually aborted", aborted === "photo-01");
  check("it is Waiting for signal, not Failed", outcome.waiting === 1 && store.rows.get("photo-01").status === "waiting");
  check("and the next photograph still went", outcome.uploaded === 1 && srv.rows.size === 1);
  clock += 2_000;
  const again = await drainQueue(stalled);
  check("the retry goes through on the same path", again.uploaded === 1 && store.rows.size === 0 && srv.rows.size === 2);
}

{
  const started = Date.now();
  const result = await withTimeout(() => new Promise(() => {}), 30).catch((cause) => cause);
  check("withTimeout rejects with StalledRequest", result instanceof StalledRequest && Date.now() - started < 500);
  const fine = await withTimeout(() => Promise.resolve("ok"), 30);
  check("and passes a prompt answer through", fine === "ok");
}

console.log("\n4b. Two at once: nothing taken twice, nothing lost, and they overlap");

check("the runner works two photographs at once", UPLOAD_CONCURRENCY === 2 && /concurrency: UPLOAD_CONCURRENCY/.test(read("../components/photos/photo-queue-runner.tsx")));
{
  const store = memoryStore(twentyFive().slice(0, 7));
  const srv = server();
  let active = 0, peak = 0; const order = [];
  const outcome = await drainQueue(
    deps(store, srv, {
      concurrency: 2,
      compress: async (file) => { active += 1; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active -= 1; return { blob: file, width: 1600, height: 1200, thumb: null }; },
      upload: async (rec, compressed) => { order.push(rec.id); await new Promise((r) => setTimeout(r, 5)); return srv.upload(rec, compressed); },
    }),
  );
  check("all seven uploaded, none waiting or failed", outcome.uploaded === 7 && outcome.waiting === 0 && outcome.failed === 0 && (await store.list()).length === 0, JSON.stringify(outcome));
  check("each photograph uploaded and attached exactly once", srv.uploads === 7 && srv.attaches === 7 && srv.rows.size === 7 && new Set(order).size === 7, `${srv.uploads} uploads, ${srv.attaches} attaches`);
  check("two were in hand at once", peak === 2, `peak ${peak}`);
  check("oldest first still", order[0] === "photo-01" && order[1] === "photo-02", order.join(","));
}
{
  const store = memoryStore(twentyFive().slice(0, 3));
  const srv = server();
  const outcome = await drainQueue(deps(store, srv));
  check("one at a time when no concurrency is asked for", outcome.uploaded === 3 && srv.uploads === 3);
}
{
  const unreadable = { size: 10, type: "image/jpeg", slice() { return { arrayBuffer: () => Promise.reject(new DOMException("The requested file could not be read", "NotReadableError")) }; } };
  const store = memoryStore([record(1, { file: unreadable }), record(2)]);
  const srv = server();
  const outcome = await drainQueue(deps(store, srv, { concurrency: 2 }));
  const left = await store.list();
  check("a photograph whose bytes are gone is Failed with the reason, not retried as Waiting", outcome.failed === 1 && left.length === 1 && left[0].status === "failed" && /choose it again/i.test(left[0].lastError), JSON.stringify(left.map((r) => [r.id, r.status, r.lastError])));
  check("and never reached the bucket", srv.uploads === 1 && srv.rows.size === 1);
  const again = await drainQueue(deps(store, srv, { concurrency: 2 }));
  check("a later drain leaves it alone", again.uploaded === 0 && again.failed === 0 && srv.uploads === 1);
}

console.log("\n5. A rejection stays Failed; Remove is asked for twice");

{
  const store = memoryStore([record(1), record(2)]);
  const srv = server();
  const outcome = await drainQueue(
    deps(store, srv, {
      attach: async (rec) => (rec.id === "photo-01" ? { error: "This report has been issued and can no longer be changed." } : srv.attach(rec, { blob: rec.file })),
    }),
  );
  check("the refused photograph is Failed with its reason", outcome.failed === 1 && store.rows.get("photo-01").status === "failed" && /issued/.test(store.rows.get("photo-01").lastError));
  check("its bytes are still on the phone", store.rows.get("photo-01").file.size > 0);
  check("the other one went", outcome.uploaded === 1 && srv.rows.size === 1);
  check("and the screen offers Retry and Remove", /retryQueued\(record\.id\)/.test(read("../components/reports/photo-upload.tsx")) && /removeQueued\(record\.id\)/.test(read("../components/reports/photo-upload.tsx")));
}

console.log("\n6. The screen, the store and the shell");

const screen = read("../components/reports/photo-upload.tsx");
const screenCode = codeOf(screen);
const store = read("../lib/photo-queue-store.ts");
const runnerUi = read("../components/photos/photo-queue-runner.tsx");
const layout = read("../app/(app)/layout.tsx");

check("the selection is secured before anything else", /setPhase\(\{ kind: "securing"/.test(screen) && screen.indexOf("securePhotos(") < screen.indexOf("resetInput(source);\n  }"));
check("Securing / secured / not secured all come from the queue's words", /securingLabel\(phase\.count\)/.test(screen) && /securedLabel\(phase\.count\)/.test(screen) && /notSecuredLabel\(/.test(screen));
check("'secured' is set only from the store's answer", /const \{ secured, reason \} = await securePhotos\(/.test(screen));
check("one transaction for the whole selection, resolved on commit", /tx\.oncomplete = \(\) => resolve\(result\)/.test(store) && /for \(const record of records\) store\.put\(/.test(store));
check("the picked files are released only after the phone has its copy", screen.indexOf("await securePhotos(") < screen.indexOf("resetInput(source);\n  }"));
check("the original bytes are copied into memory before securing, not referenced", /new Blob\(\[await file\.arrayBuffer\(\)\], \{ type: file\.type \}\)/.test(screen) && /file: copies\[index\]!/.test(screen) && !/file\.slice\(/.test(screenCode) && !/compress/.test(screenCode));
check("the screen does no uploading of its own", !/\.storage\.|attachPhoto|attachSummaryPhoto/.test(screenCode));
check("the honest notice is shown while anything is pending", /pending > 0 \? <p[^>]*>\{KEEP_OPEN_NOTICE\}<\/p>/.test(screen));
check("Uploaded rows come only from confirmed rows", /noteUploaded\(record\)/.test(runnerUi) && /onUploaded: \(record\) =>/.test(runnerUi) && /deps\.onUploaded\?\.\(next\)/.test(read("../lib/photo-queue-runner.ts")));
check("Remove goes through the inline confirmation", /<ConfirmAction[\s\S]{0,400}?title="Remove this photo\?"/.test(screen));
check("the removal says what it discards", /discards the copy secured on this phone/.test(screen));
check("no beforeunload prompt anywhere in the upload path", !/beforeunload/.test(screen) && !/beforeunload/.test(runnerUi));

check("the runner is mounted once, in the signed-in shell", /<PhotoQueueRunner \/>/.test(layout) && /photo-queue-runner/.test(layout));
check("it drains on mount, on signal, on coming to the front, and on a clock", /addEventListener\("online", kick\)/.test(runnerUi) && /visibilitychange/.test(runnerUi) && /pageshow/.test(runnerUi) && /setInterval\(kick, SAFETY_INTERVAL_MS\)/.test(runnerUi));
check("under a Web Lock when the browser has one", /navigator\.locks/.test(runnerUi) && /ifAvailable: true/.test(runnerUi) && /typeof locks\.request === "function"/.test(runnerUi));
check("with a fallback when it has not", /\} else \{\s*void drain\(\);/.test(runnerUi));
check("storage persistence is asked for, feature-detected, and never assumed", /typeof storage\.persist !== "function"\) return null/.test(store) && /const granted = await storage\.persist\(\)/.test(store));
check("the upload carries an abort signal into fetch", /fetch\(input, \{ \.\.\.init, signal \}\)/.test(runnerUi));
check("under the one-minute deadline", /timeoutMs: UPLOAD_TIMEOUT_MS/.test(runnerUi));
check("the same path every attempt, upserted", /upload\(record\.path, compressed\.blob/.test(runnerUi) && /upsert: true/.test(runnerUi));
check("the row is attached from the record, not re-derived", /storagePath: record\.path/.test(runnerUi));
check("the chip says how many are waiting elsewhere", /waitingLabel\(elsewhere\.length\)/.test(runnerUi) && /pendingElsewhere\(snap\)/.test(runnerUi));
check("and a screen with its own list is not double-counted", /registerVisibleTarget\(target\)/.test(screen) && /visibleTargets/.test(store));
check("other tabs hear about changes", /BroadcastChannel/.test(store));
check("a read that fails never makes the screen look emptier than the phone", /snapshot\.records\.filter\(\(record\) => record\.secured\)/.test(store));

console.log("\n7. Nothing else moved");

const actions = read("../app/(app)/reports/photo-actions.ts");
check("the server still refuses a second row for a path it has", /\.eq\("storage_path", storagePath\)[\s\S]{0,200}?if \(existing\)/.test(actions));
check("no migration for the queue", !readdirSync(new URL("../supabase/migrations", import.meta.url)).some((name) => /queue|upload/.test(name)), "the queue lives on the phone; the only later migration is recent_locations, approved separately");
check("the compression rules are the same file they were", /JPEG_QUALITY = 0\.88/.test(read("../lib/photo-quality.ts")) && /MAX_EDGE = 1600/.test(read("../lib/photo-quality.ts")));
check("document upload is untouched by this pass", !/photo-queue/.test(read("../components/documents/document-upload.tsx")));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("All checks passed.");
} else {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  FAILED: ${failure}`);
  process.exitCode = 1;
}
