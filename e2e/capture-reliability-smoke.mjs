/**
 * Site Capture on one bar of signal.
 *
 * Not an offline system - a capture still has to reach the server before it
 * counts, and nothing here ever says "saved" before it has. What is checked is
 * the narrower set of promises underneath: that a second tap does not write the
 * day twice, that a failed request keeps the words, that a retried photograph
 * does not become two photographs, and that nothing already recorded is ever
 * overwritten.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:capture-reliability
 */

import { readFileSync } from "node:fs";

import {
  alreadyEnded,
  appendCapture,
  parseCaptureLog,
} from "../lib/reports/capture-log.ts";
import {
  clearCaptureDraft,
  readCaptureDraft,
  subscribeToCaptureDraft,
  writeCaptureDraft,
} from "../lib/capture-draft.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const actions = read("../app/(app)/reports/capture-actions.ts");
const form = read("../components/reports/site-capture-form.tsx");
const upload = read("../components/reports/photo-upload.tsx");
const photoActions = read("../app/(app)/reports/photo-actions.ts");
const summaryPhotoActions = read("../app/(app)/summary-reports/photo-actions.ts");

console.log("\n1. Append twice: two captures, both kept");

const first = appendCapture(null, "Slab poured to the north bay.", "08:00");
const second = appendCapture(first, "Steel delivery offloaded.", "10:30");
check("the second keeps the first, character for character", second.startsWith(first));
check("both are readable back", parseCaptureLog(second).length === 2);
check("in the order they were spoken", parseCaptureLog(second).map((e) => e.at).join() === "08:00,10:30");
check("with their words intact", second.includes("Slab poured") && second.includes("Steel delivery"));

console.log("\n2. Retry the same append: said once, not twice");

check(
  "a capture already at the end of the log is recognised",
  alreadyEnded(second, "Steel delivery offloaded.", "10:30"),
);
check(
  "and the action answers 'saved' rather than writing it again",
  /if \(alreadyEnded\(current\.raw_notes, parsed\.data\.text, parsed\.data\.at\)\) \{\s*\n\s*return \{ savedAt/.test(
    actions,
  ),
);
check(
  "the same words at a different minute are a different capture",
  !alreadyEnded(second, "Steel delivery offloaded.", "14:05"),
  "somebody repeating themselves on site is a fact about the day",
);
check(
  "and the same words earlier in the log do not block a later one",
  !alreadyEnded(second, "Slab poured to the north bay.", "08:00"),
);
check("an empty log blocks nothing", !alreadyEnded(null, "anything", "08:00"));
check(
  "the button goes dead for the round trip",
  /disabled=\{pending\}/.test(form),
  "two taps on one bar of signal used to be two entries",
);

console.log("\n3. A failed append is obvious, keeps the words, and can be retried");

check("the failure is shown", /state\.error \? <Alert tone="danger">/.test(form));
check("the button becomes Try again", /retry \? \(/.test(form) && /Try again/.test(form));
check(
  "and the status says the words are safe",
  /Not saved - your words are safe here/.test(form),
);
check(
  "the box is only emptied when the server confirms",
  /const landed = !state\.error && state\.savedAt !== undefined/.test(form) &&
    /if \(landed\) clearCaptureDraft\(reportId\)/.test(form),
);
check(
  "never on a failure",
  // The clear is guarded by `landed`, and `landed` is false whenever the
  // action came back with an error - so a failed save cannot reach it.
  /const landed = !state\.error &&/.test(form) &&
    !/if \(!landed\)[\s\S]{0,60}clearCaptureDraft/.test(form),
);
check(
  "and the write still refuses to overwrite somebody else's append",
  /\.eq\("raw_notes", current\.raw_notes\)/.test(actions) && /APPEND_ATTEMPTS/.test(actions),
);

console.log("\n4. Refresh, reopen, or a tab iOS threw away");

// A tiny store rather than component state, so the screen reads it without
// writing state on mount - and so a test can drive it.
const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  },
  addEventListener() {},
  removeEventListener() {},
};

check("nothing stored reads as nothing", readCaptureDraft("r1") === "");
writeCaptureDraft("r1", "half a sentence about the sl");
check("what was typed comes back", readCaptureDraft("r1") === "half a sentence about the sl");
check("and is kept per report", readCaptureDraft("r2") === "");

let notified = 0;
const stop = subscribeToCaptureDraft(() => (notified += 1));
writeCaptureDraft("r1", "half a sentence about the slab");
check(
  "typing does not rebuild the box under a thumb",
  notified === 0,
  "the box already holds those words",
);
clearCaptureDraft("r1");
check("but a landed capture empties it", readCaptureDraft("r1") === "");
check("and says so, so the box comes back empty", notified === 1);
stop();

writeCaptureDraft("r1", "   ");
check("whitespace is not a draft", readCaptureDraft("r1") === "");

check(
  "the screen reads it without writing state on mount",
  /useSyncExternalStore\(/.test(form),
  "an effect setting state on mount is how a hydration mismatch starts",
);
check("the server renders empty", /\(\) => "",/.test(form));
check(
  "and the box is rebuilt only when the stored draft or the count changes",
  /key=\{`\$\{entryCount\}:\$\{restored\.length\}`\}/.test(form),
);
check(
  "a store that throws does not take the screen with it",
  (read("../lib/capture-draft.ts").match(/catch \{/g) ?? []).length >= 3,
  "Safari in private mode throws on localStorage",
);
check(
  "and the earlier entries are still read from the server, never from the phone",
  /parseCaptureLog\(report\.raw_notes\)/.test(read("../app/(app)/reports/[id]/capture/page.tsx")),
);

console.log("\n5. A photograph that failed is kept, and retried onto the same object");

check(
  "the storage path is minted once, when the file is chosen",
  /path: `\$\{photoPathPrefix\(companyId, projectId\)\}\$\{crypto\.randomUUID\(\)\}\.jpg`/.test(upload),
);
check(
  "and never again per attempt",
  (upload.match(/crypto\.randomUUID\(\)/g) ?? []).length === 2,
  "one for the item id, one for the path",
);
check("a retry writes the same object", /upsert: true/.test(upload));
check("failures are kept with their bytes", /setFailed\(stillFailing\)/.test(upload));
check("and offered back with a Try again", /onClick=\{\(\) => void send\(failed\)\}/.test(upload));
check(
  "nothing is called uploaded until the row exists",
  /if \(result\?\.error\) throw new Error\(result\.error\)/.test(upload),
  "an object in the bucket with no row is not a photograph in the report",
);
check("uploading says so while it runs", /Uploading \{busy\.done\} of \{busy\.total\}/.test(upload));
check(
  "and leaving mid-upload asks first",
  /beforeunload/.test(upload),
  "the one thing that can be done about it without an offline queue",
);

console.log("\n6. A duplicate retry does not create a duplicate photograph");

check(
  "a daily report refuses a second row for a path it already has",
  /\.from\("photos"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("storage_path", storagePath\)/.test(
    photoActions,
  ),
);
check(
  "and returns success rather than an error, because it really is attached",
  /if \(existing\) \{[\s\S]{0,200}return \{\};/.test(photoActions),
);
check(
  "a consolidated report reuses the row it made last time",
  /\.eq\("storage_path", storagePath\)/.test(summaryPhotoActions),
);
check(
  "and does not link the same photograph to the same report twice",
  /\.eq\("summary_report_id", summaryReportId\)\s*\n\s*\.eq\("photo_id", photo\.id\)/.test(
    summaryPhotoActions,
  ),
);

console.log("\n7. Nothing that was working stopped working");

check("an issued report still takes no capture", /REPORT_IS_FINAL/.test(actions));
check("and no photograph", /REPORT_IS_FINAL/.test(photoActions));
check(
  "a photograph is still refused outside its own company's folder",
  /storagePath\.startsWith\(photoPathPrefix\(session\.companyId/.test(photoActions),
);
check("captions and status are still saved where they were", /caption_override|original_caption/.test(photoActions));
check(
  "the order is still the report's own",
  /sort_order: await nextSortOrder/.test(summaryPhotoActions),
);
check(
  "Site Capture still appends rather than replaces",
  /appendCapture\(current\.raw_notes/.test(actions),
);
check("and still reads the notes from the database", /\.select\("id, project_id, raw_notes, status"\)/.test(actions));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL CAPTURE RELIABILITY CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
