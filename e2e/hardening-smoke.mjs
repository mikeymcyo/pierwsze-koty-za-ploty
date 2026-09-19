/**
 * Reliability and integrity hardening, after the independent audit.
 *
 * Ten proven ways to lose typed words or let an issued record drift, each
 * closed with the smallest change and pinned here so it stays closed:
 *
 *   1. a failed request keeps the form and its text (lib/actions/recover.ts);
 *   2. a stale report screen cannot erase captures added elsewhere
 *      (lib/reports/notes-cas.ts);
 *   3. a photograph landing in the queue does not remount the dictation box
 *      (lib/capture-draft.ts snapshots, one refresh per drain);
 *   4. finalising refuses when a plate could not be read
 *      (lib/pdf/missing-photos.ts);
 *   5. deleting a photograph is asked twice;
 *   6. issued and dependent evidence refuses to move (dependentsOfPhoto,
 *      reopenBlockedBy);
 *   7. a summary whose links failed to save is not created;
 *   8. an issued Daily takes no new issue or document link;
 *   9. Apply writes only over the text the reviewer read
 *      (withoutStaleWrites);
 *  10. the login redirect cannot leave the site.
 *
 * Needs no Supabase, no dev server, no browser:
 *
 *   npm run test:hardening
 */

import { readFileSync } from "node:fs";

import {
  ACTION_FAILED,
  ACTION_UNREACHABLE,
  describeActionFailure,
  recoverable,
} from "../lib/actions/recover.ts";
import {
  clearCaptureDraft,
  readCaptureDraft,
  resetCaptureDraftSnapshots,
  writeCaptureDraft,
} from "../lib/capture-draft.ts";
import { safeReturnPath } from "../lib/navigation.ts";
import { describeMissingPhotos, missingPhotos } from "../lib/pdf/missing-photos.ts";
import { photoReference } from "../lib/pdf/photo-evidence.ts";
import { reopenBlockedBy } from "../lib/reports/lifecycle.ts";
import {
  describeConflicts,
  reconcileReview,
  withoutStaleWrites,
} from "../lib/reports/master-review.ts";
import { NOTES_CHANGED_ELSEWHERE, decideNotesWrite } from "../lib/reports/notes-cas.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. A failed request keeps the form and its text");

{
  const previous = { error: undefined, savedAt: "08:14" };
  const dead = recoverable(async () => {
    throw new TypeError("Load failed");
  });
  const result = await dead(previous, new FormData());
  check("a network failure resolves to the form's own error", result.error === ACTION_UNREACHABLE);
  check("and keeps the previous state beside it", result.savedAt === "08:14");
  check("the wording says the text is still here", /your text is still here/i.test(ACTION_UNREACHABLE) && /your text is still here/i.test(ACTION_FAILED));
  const broken = recoverable(async () => {
    throw new Error("relation does not exist");
  });
  check("any other failure resolves too, with the softer line", (await broken({}, new FormData())).error === ACTION_FAILED);
  const fine = recoverable(async (_p, formData) => ({ error: undefined, got: formData.get("x") }));
  const fd = new FormData();
  fd.set("x", "y");
  check("a working action is untouched", (await fine({}, fd)).got === "y");
  const redirecting = recoverable(async () => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/reports;307" });
  });
  let escaped = null;
  await redirecting({}, new FormData()).catch((cause) => (escaped = cause));
  check("a redirect still passes through, because it is not a failure", escaped?.digest?.startsWith("NEXT_REDIRECT"));
  check("Chrome's and Safari's network words both count", describeActionFailure(new TypeError("Failed to fetch")) === ACTION_UNREACHABLE && describeActionFailure(new Error("Connection closed")) === ACTION_UNREACHABLE);

  const hook = read("../lib/hooks/use-recoverable-action-state.ts");
  check("the hook wraps useActionState with recoverable", /recoverable<S, \[P\]>\(action\)/.test(hook) && /useActionState\(/.test(hook));
  const forms = [
    "../components/reports/group-editor.tsx",
    "../components/reports/report-capture-form.tsx",
    "../components/reports/site-capture-form.tsx",
    "../components/reports/finalise-report.tsx",
    "../components/reports/master-review.tsx",
    "../components/reports/review-findings.tsx",
    "../components/reports/photo-details.tsx",
    "../components/issues/issue-form.tsx",
    "../components/issues/raise-issue.tsx",
    "../components/issues/resolve-issue.tsx",
    "../components/issues/move-issue-button.tsx",
    "../components/summary-reports/summary-curation.tsx",
    "../components/summary-reports/summary-details.tsx",
    "../components/summary-reports/summary-draft.tsx",
    "../components/summary-reports/summary-finalise.tsx",
  ];
  for (const file of forms) {
    const source = codeOf(read(file));
    check(`${file.split("/").pop()} never hands a failed request to the error boundary`, /useRecoverableActionState/.test(source) && !/\buseActionState\b/.test(source));
  }
  check("GroupEditor shows the error beside the text it kept", /state\.error \? <Alert tone="danger">\{state\.error\}<\/Alert>/.test(read("../components/reports/group-editor.tsx")));
  const issues = read("../app/(app)/issues/actions.ts");
  check("a one-tap status change no longer throws", !/if \(moved\.error\) throw new Error/.test(issues));
  check("the issue list uses the button that returns its error", /<MoveIssueButton/.test(read("../components/issues/issue-list.tsx")) && !/action=\{setIssueStatus\}/.test(read("../components/issues/issue-list.tsx")));
  check("the signed-in shell has a boundary of its own, as a backstop", /export default function AppErrorBoundary/.test(read("../app/(app)/error.tsx")));
}

console.log("\n2. A stale report screen cannot erase captures added elsewhere");

{
  const morning = "[08:00] Slab poured.";
  const afternoon = "[08:00] Slab poured.\n\n[14:00] Steel delivered.";
  check("untouched notes are left out of the write, whatever the database holds now", decideNotesWrite({ base: morning, posted: morning, current: afternoon }).kind === "skip");
  check("an edit over an unchanged database is written, against that value", JSON.stringify(decideNotesWrite({ base: morning, posted: morning + " Two loads.", current: morning })) === JSON.stringify({ kind: "write", expect: morning }));
  check("an edit over notes that moved on is refused", decideNotesWrite({ base: morning, posted: morning + " Two loads.", current: afternoon }).kind === "conflict");
  check("whitespace and null are the same empty box", decideNotesWrite({ base: "", posted: "  ", current: null }).kind === "skip" && decideNotesWrite({ base: "", posted: "First note.", current: null }).kind === "write");
  check("a screen from before the check saves as it always did", decideNotesWrite({ base: null, posted: "x", current: "y" }).kind === "write");
  check("the message says nothing was overwritten and what to do", /Nothing was overwritten/.test(NOTES_CHANGED_ELSEWHERE) && /Reload/.test(NOTES_CHANGED_ELSEWHERE));

  const save = read("../lib/reports/save-capture.ts");
  check("save-capture reads the notes before it writes them", /select\("raw_notes, status"\)/.test(save) && /decideNotesWrite\(\{ base, posted: parsed\.data\.raw_notes, current: current\.raw_notes \}\)/.test(save));
  check("and writes them under a compare-and-set", /write\.is\("raw_notes", null\) : write\.eq\("raw_notes", decision\.expect\)/.test(save));
  check("a skipped write leaves raw_notes out of the patch", /const patch = decision\.kind === "write" \? \{ \.\.\.details, raw_notes: postedNotes \} : details;/.test(save));
  check("the writer is handed the notes the database holds", /rawNotes: decision\.kind === "write" \? parsed\.data\.raw_notes : current\.raw_notes/.test(save));
  check("the report screen posts what it loaded", /name="raw_notes_base" value=\{report\.raw_notes \?\? ""\}/.test(read("../components/reports/report-capture-form.tsx")));
}

console.log("\n3. A photograph landing does not remount the dictation box");

{
  // A browser-shaped window with a working localStorage.
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    addEventListener() {},
    removeEventListener() {},
  };
  resetCaptureDraftSnapshots();
  store.set("siteboss:capture:r1", "Poured the slab");
  const first = readCaptureDraft("r1");
  writeCaptureDraft("r1", "Poured the slab in the north bay");
  writeCaptureDraft("r1", "Poured the slab in the north bay, two loads");
  const again = readCaptureDraft("r1");
  check("the snapshot a screen was handed does not move as the person types", first === "Poured the slab" && again === first);
  check("while the phone still holds every word", store.get("siteboss:capture:r1") === "Poured the slab in the north bay, two loads");
  clearCaptureDraft("r1");
  check("clearing - the server has it - is what empties the snapshot", readCaptureDraft("r1") === "" && !store.has("siteboss:capture:r1"));
  delete globalThis.window;

  const form = read("../components/reports/site-capture-form.tsx");
  check("the box is still keyed on the restored draft, which now only changes when it should", /key=\{`\$\{entryCount\}:\$\{restored\.length\}`\}/.test(form));
  const runner = read("../components/photos/photo-queue-runner.tsx");
  const onUploaded = runner.slice(runner.indexOf("onUploaded: (record) => {"), runner.indexOf("});", runner.indexOf("onUploaded: (record) => {")));
  check("the queue refreshes the page once per drain, not per photograph", !/scheduleRefresh|router\.refresh/.test(onUploaded) && /if \(uploaded > 0\) scheduleRefresh\(\);/.test(runner));
  check("and still notes each photograph as Uploaded as it lands", /onUploaded: \(record\) => \{\s*uploaded \+= 1;\s*noteUploaded\(record\);\s*\}/.test(runner));
}

console.log("\n4. Finalising refuses when a plate could not be read");

{
  const rows = [
    { id: "a", caption: "Slab, north bay", storage_path: "p/a.jpg" },
    { id: "b", caption: null, storage_path: "p/b.jpg" },
    { id: "c", caption: "A very long caption that goes on past forty characters for sure", storage_path: "p/c.jpg" },
  ];
  const loaded = new Set(["p/a.jpg"]);
  const missing = missingPhotos(rows, (row) => loaded.has(row.storage_path));
  check("the unread plates are found in print order", missing.map((m) => m.row.id).join() === "b,c");
  const message = describeMissingPhotos(missing, rows.length, photoReference);
  check("the message counts them and names their plates", /2 of 3 photographs/.test(message) && /P02/.test(message) && /P03 \(A very long caption that goes on past fo…\)/.test(message), message);
  check("and says nothing was finalised", /Nothing has been finalised/.test(message));
  check("nothing missing is nothing to say", missingPhotos(rows, () => true).length === 0);

  const daily = read("../app/(app)/reports/finalise-actions.ts");
  check("the Daily finalise stops on an unread plate before rendering", /const unread = missingPhotos\(photoRows, \(photo\) => downloaded\.has\(photo\.storage_path\)\);\s*if \(unread\.length > 0\) \{\s*return \{ error: describeMissingPhotos/.test(daily) && daily.indexOf("missingPhotos(photoRows") < daily.indexOf("renderReportPdf("));
  const summary = read("../app/(app)/summary-reports/finalise-actions.ts");
  check("and so does the Progress/Completion finalise", /if \(loaded\.missingPhotos\.length > 0\)/.test(summary) && summary.indexOf("loaded.missingPhotos.length") < summary.indexOf("renderSummaryReportPdf("));
  check("the summary loader reports the unread plates rather than dropping them quietly", /missingPhotos,\n/.test(read("../lib/summary-reports/pdf-data.ts")));
}

console.log("\n5. Deleting a photograph is asked twice");

{
  const grid = read("../components/reports/photo-grid.tsx");
  check("the tile's icon only opens the question", /onClick=\{\(\) => setConfirming\(photo\.id\)\}/.test(grid) && !/<form\s+action=\{deletePhoto\}/.test(grid));
  check("the delete itself is the inline confirmation everything else uses", /<ConfirmAction\s+action=\{deletePhoto\}\s+hiddenFields=\{\{ photoId: photo\.id \}\}/.test(grid));
  check("which says what is lost", /cannot be got back/.test(grid));
}

console.log("\n6. Issued and dependent evidence refuses to move");

{
  const issued = [{ id: "s1", label: "Completion Report 001" }];
  const draft = [{ id: "s2", label: "Progress Report 002 (draft)" }];
  check("a Daily cited by an issued document cannot be reopened", /cannot be reopened: Completion Report 001 was issued from it/.test(reopenBlockedBy(issued) ?? ""));
  check("a draft dependent does not block a reopen", reopenBlockedBy(draft) === null);
  check("nothing dependent, nothing blocked", reopenBlockedBy([]) === null);

  const actions = read("../app/(app)/reports/finalise-actions.ts");
  check("reopenReport asks about dependents before it flips the status", /reopenBlockedBy\(await dependentsOfDailyReport\(supabase, reportId\)\)/.test(actions) && actions.indexOf("reopenBlockedBy(") < actions.indexOf('.update({ status: "draft" })'));

  const photos = read("../app/(app)/reports/photo-actions.ts");
  const deleteBody = photos.slice(photos.indexOf("export async function deletePhoto"), photos.indexOf("const detailsSchema"));
  const detailsBody = photos.slice(photos.indexOf("export async function savePhotoDetails"), photos.indexOf("export type PhotoRotationState"));
  const rotateBody = photos.slice(photos.indexOf("export async function rotatePhoto"), photos.indexOf("export type PhotoOrderState"));
  check("deletePhoto refuses when any summary prints the photograph", /deletionBlockedBy\(await dependentsOfPhoto\(supabase, photoId\)\)/.test(deleteBody) && deleteBody.indexOf("dependentsOfPhoto") < deleteBody.indexOf(".delete()"));
  check("savePhotoDetails refuses when an issued summary prints it", /issuedDependents\(await dependentsOfPhoto\(supabase, photoId\)\)/.test(detailsBody) && detailsBody.indexOf("issuedDependents") < detailsBody.indexOf(".update({ caption"));
  check("rotatePhoto refuses the same way", /issuedDependents\(await dependentsOfPhoto\(supabase, photoId\)\)/.test(rotateBody) && rotateBody.indexOf("issuedDependents") < rotateBody.indexOf(".update({ rotation"));
  const dependents = read("../lib/reports/dependents.ts");
  check("the lookup goes by the photograph itself, so report_id null is covered", /from\("summary_report_photos"\)\s*\.select\("summary_report_id"\)\s*\.eq\("photo_id", photoId\)/.test(dependents));
  const issuedOnly = dependents.slice(dependents.indexOf("export function issuedDependents"));
  check("and only issued ones count for a caption or a turn", /export function issuedDependents/.test(dependents) && /draft\\\)\$\/\.test\(document\.label\)/.test(issuedOnly), issuedOnly.slice(0, 200));
}

console.log("\n7. A summary whose links failed to save is not created");

{
  const actions = read("../app/(app)/summary-reports/actions.ts");
  check("the photograph links are checked", /const \{ error: photosError \} = await supabase\.from\("summary_report_photos"\)\.insert\(/.test(actions) && /if \(photosError\) \{\s*await supabase\.from\("summary_reports"\)\.delete\(\)\.eq\("id", summary\.id\);\s*return \{ error: `Could not link the photographs/.test(actions));
  check("and the issue links", /const \{ error: issuesError \} = await supabase\.from\("summary_report_issues"\)\.insert\(/.test(actions) && /if \(issuesError\) \{\s*await supabase\.from\("summary_reports"\)\.delete\(\)\.eq\("id", summary\.id\);\s*return \{ error: `Could not link the issues/.test(actions));
  const startBody = actions.slice(actions.indexOf("export async function startSummaryReport"), actions.indexOf("export async function", actions.indexOf("export async function startSummaryReport") + 10));
  const inserts = [...startBody.matchAll(/await supabase\.from\("summary_report_(photos|issues|sources|sections)"\)\.insert\(/g)];
  check("no insert on the way is left unchecked", inserts.length === 4 && inserts.every((m) => /error/.test(startBody.slice(Math.max(0, m.index - 60), m.index))), String(inserts.length));
}

console.log("\n8. An issued Daily takes no new issue or document link");

{
  const issues = read("../app/(app)/issues/actions.ts");
  const createBody = issues.slice(issues.indexOf("export async function createIssue"), issues.indexOf("export async function", issues.indexOf("export async function createIssue") + 10));
  check("createIssue reads the Daily's status when one is named", /if \(input\.reportId\) \{[\s\S]*?\.select\("status"\)[\s\S]*?if \(report\.status === "final"\) return \{ error: REPORT_IS_FINAL \};/.test(createBody) && createBody.indexOf("REPORT_IS_FINAL") < createBody.indexOf('.from("issues").insert('));
  const documents = read("../app/(app)/documents/actions.ts");
  check("attachDocument keeps the document but refuses the link to an issued Daily", /if \(report\?\.status === "final"\) \{[\s\S]*?not linked to this report/.test(documents) && documents.indexOf('report?.status === "final"') < documents.indexOf('.from("report_documents").insert('));
  check("and a link that fails to write is no longer silent", /const \{ error: linkError \} = await supabase\.from\("report_documents"\)\.insert\(/.test(documents));
}

console.log("\n9. Apply writes only over the text the reviewer read");

{
  const current = [
    { sectionType: "summary", label: "Summary", content: "Edited by hand after the review.", aiGenerated: true },
    { sectionType: "works", label: "Works", content: "Original works text.", aiGenerated: true },
  ];
  const proposal = [
    { sectionType: "summary", proposedText: "Reviewer's summary." },
    { sectionType: "works", proposedText: "Reviewer's works." },
  ];
  const review = reconcileReview(current, proposal, [], "");
  const reviewed = [
    { sectionType: "summary", originalText: "What the reviewer read.", proposedText: "Reviewer's summary." },
    { sectionType: "works", originalText: "Original works text.", proposedText: "Reviewer's works." },
  ];
  const { writes, conflicts } = withoutStaleWrites(review, ["summary", "works"], reviewed);
  check("the section edited since the review is left as edited", !writes.some((w) => w.sectionType === "summary") && conflicts.join() === "Summary");
  check("the untouched section is written", writes.length === 1 && writes[0].sectionType === "works" && writes[0].content === "Reviewer's works.");
  check("the conflict is named, and the person is told the edit was kept", /Summary was edited after this review ran, so the edit was kept/.test(describeConflicts(conflicts) ?? ""));
  const legacy = withoutStaleWrites(review, ["summary"], [{ sectionType: "summary", proposedText: "x" }]);
  check("a payload from before the check is written as before", legacy.writes.length === 1 && legacy.conflicts.length === 0);
  check("no conflicts, no line", describeConflicts([]) === null);

  const ui = read("../components/reports/master-review.tsx");
  check("the screen sends what the reviewer read", /originalText: section\.originalText,\s*proposedText: section\.proposedText,/.test(ui));
  const actions = read("../app/(app)/reports/review-actions.ts");
  check("the action filters through it and reports the conflicts", /withoutStaleWrites\(review, accepted, payload\.sections\)/.test(actions) && /describeConflicts\(conflicts\)/.test(actions) && !/sectionsToApply\(/.test(actions));
}

console.log("\n10. The login redirect cannot leave the site");

{
  const cases = [
    ["/dashboard", "/dashboard"],
    ["/reports/abc?x=1", "/reports/abc?x=1"],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["/\\\\evil.com", null],
    ["/\\evil.com/login", null],
    ["https://evil.com", null],
    ["javascript:alert(1)", null],
    ["evil.com", null],
    ["/%5Cevil.com", "/%5Cevil.com"],
  ];
  for (const [input, expected] of cases) {
    check(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, safeReturnPath(input) === expected, String(safeReturnPath(input)));
  }
  check("an encoded backslash stays a path on this origin", new URL("/%5Cevil.com", "https://app.example").origin === "https://app.example");
  check("whereas a raw one would not have", new URL("/\\evil.com", "https://app.example").origin === "https://evil.com");
  const auth = read("../app/(auth)/actions.ts");
  check("the login action uses the shared rule", /return safeReturnPath\(typeof value === "string" \? value : null\) \?\? "\/dashboard";/.test(auth) && !/startsWith\("\/\/"\)/.test(auth));
  const callback = read("../app/auth/callback/route.ts");
  check("and so does the email-link callback", /safeReturnPath\(next\) \?\? "\/dashboard"/.test(callback) && !/startsWith\("\/\/"\)/.test(callback));
}

console.log("\n11. An issued PDF cannot be replaced: the update policy is gone, and only that");

const pdfPolicy = read("../supabase/migrations/20260918000001_report_pdfs_no_update.sql").replace(/^\s*--.*$/gm, "");
check("the migration drops the report-pdfs update policy", /drop policy if exists "report-pdfs_update" on storage\.objects;/.test(pdfPolicy));
check("and nothing else: no other drop, create, alter or grant", (pdfPolicy.match(/\b(drop|create|alter|grant|revoke)\b/gi) ?? []).length === 1);
check("select, insert and delete on report-pdfs are not mentioned", !/report-pdfs_(select|insert|delete)/.test(pdfPolicy));
check("the photo and document buckets are not touched", !/site-photos|project-documents/.test(pdfPolicy));
const finaliseDaily = read("../app/(app)/reports/finalise-actions.ts"), finaliseSummary = read("../app/(app)/summary-reports/finalise-actions.ts");
check("both finalise actions still write a fresh object, never over one", /upsert: false/.test(finaliseDaily) && /upsert: false/.test(finaliseSummary) && !/\.update\(\s*[^)]*\.pdf|\.upload\([^)]*upsert: true/.test(finaliseDaily + finaliseSummary));
check("nothing in the app updates or moves a PDF object", !/from\(PDF_BUCKET\)\s*\.(update|move|copy)\(/.test([finaliseDaily, finaliseSummary, read("../app/(app)/reports/actions.ts"), read("../app/(app)/summary-reports/actions.ts"), read("../app/(app)/projects/actions.ts"), read("../lib/pdf/download.ts")].join("\n")));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("All checks passed.");
} else {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  FAILED: ${failure}`);
  process.exitCode = 1;
}
