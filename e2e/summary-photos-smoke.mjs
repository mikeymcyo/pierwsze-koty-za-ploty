/**
 * One photograph set per consolidated report.
 *
 * A real test found what looked like two: the plates in Arrange Photos were
 * the ones that printed but had no caption control, and a second list offered
 * "Caption in this report" on photographs that never appeared in the PDF. They
 * were never two sets in the database - `summary_report_photos` has always
 * been the one truth - but the screen offered captions on photographs that
 * were not in the report, and saving that form scrambled the order the plates
 * had just been arranged into.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:summary-photos
 */

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const actions = read("../app/(app)/summary-reports/actions.ts");
const photoActions = read("../app/(app)/summary-reports/photo-actions.ts");
const page = read("../app/(app)/summary-reports/[id]/page.tsx");
const curation = read("../components/summary-reports/summary-curation.tsx");
const arrange = read("../components/summary-reports/report-photos.tsx");
const pdfData = read("../lib/summary-reports/pdf-data.ts");

// The save reconciles rather than rewrites, so the assertions below read the
// one function rather than the whole file.
const saveStart = actions.indexOf("export async function saveSummaryCuration");
const saveEnd = actions.indexOf("\nexport async function", saveStart + 1);
const save = actions.slice(saveStart, saveEnd === -1 ? undefined : saveEnd);

console.log("\n1. One table decides what is printed");

check(
  "the PDF reads the report's own photograph links",
  /\.from\("summary_report_photos"\)/.test(pdfData),
);
check("in their stored order", /\.order\("sort_order", \{ ascending: true \}\)/.test(pdfData));
check(
  "and prints the caption written for this report where there is one",
  /link\.caption_override\?\.trim\(\) \|\| photo\.caption/.test(pdfData),
);
check(
  "the screen's plate list is built from the same links",
  /const attachedPhotos: ReportPhoto\[\] = \(photoLinksResult\.data \?\? \[\]\)/.test(page),
);
check("read in the same order", /\.order\("sort_order", \{ ascending: true \}\)/.test(page));
check(
  "and carrying the same caption",
  /captionOverride: link\.caption_override/.test(page),
);
check(
  "so Arrange shows what will actually print",
  /photo\.captionOverride\?\.trim\(\) \|\| photo\.caption/.test(arrange),
);
check(
  "a link the screen cannot resolve is refused, not silently dropped",
  /const unresolvedPlates =/.test(page) && /could not be loaded onto this screen/.test(page),
);

console.log("\n2. A caption is only offered on a photograph that is in the report");

check(
  "the tick drives the state rather than the DOM",
  /const \[included, setIncluded\] = useState<Set<string>>/.test(curation),
);
check("the checkbox is controlled by it", /checked=\{inReport\}/.test(curation));
check(
  "and the caption box only exists when the photograph is in",
  /\{inReport \? \(\s*<input\s*\n\s*type="text"\s*\n\s*name=\{`photoCaption_/.test(curation),
  "a caption on a photograph that will not print goes nowhere",
);
check(
  "an included photograph is visibly included",
  /inReport \? "border-brand bg-brand-soft"/.test(curation),
);
check(
  "and the form says what ticking actually does",
  /those, and only those, are printed/.test(curation),
);
check(
  "and that saving it does not restack the plates",
  /order is set in Arrange Photos above and is not changed by saving here/.test(curation),
);

console.log("\n3. Saving the selection cannot scramble the order");

check(
  "the existing links are read before anything is written",
  /const \{ data: existingLinks, error: existingError \} = await supabase/.test(save),
);
check("in their stored order", /\.order\("sort_order", \{ ascending: true \}\)/.test(save));
check(
  "photographs no longer ticked are removed, and only those",
  /\.delete\(\)\s*\n\s*\.eq\("summary_report_id", reportId\)\s*\n\s*\.in\("photo_id", dropped\)/.test(save),
);
check(
  "the whole set is no longer deleted",
  !/from\("summary_report_photos"\)\.delete\(\)\.eq\("summary_report_id", reportId\)/.test(save),
  "that is what lost the arranged order",
);
check(
  "a photograph that is staying has only its caption written",
  /\.update\(\{ caption_override: caption \}\)/.test(save),
);
check(
  "and never its position",
  !/\.update\(\{[^}]*sort_order/.test(save),
  "writing sort_order here is exactly what scrambled the plates",
);
check(
  "a newly ticked photograph is appended after everything already there",
  /let next = \(existingLinks \?\? \[\]\)\.reduce\(/.test(save) && /next \+= 1;/.test(save),
);
check(
  "a caption that has not changed is not rewritten",
  /if \(existing\.caption_override !== caption\)/.test(save),
);

console.log("\n4. Reordering keeps every caption attached to its own photograph");

const reorderStart = photoActions.indexOf("export async function reorderSummaryPhotos");
// Bounded at the next doc comment, not the next export: the comment above the
// following function sits between them and mentions captions in passing.
const reorderEnd = photoActions.indexOf("\n/**", reorderStart + 1);
const reorder = photoActions.slice(reorderStart, reorderEnd === -1 ? undefined : reorderEnd);

check("the reorder writes one column", /\.update\(\{ sort_order: sortOrder \}\)/.test(reorder));
check(
  "and never touches the caption",
  !/caption_override/.test(reorder),
  "a caption belongs to a photograph, not to a position",
);
check(
  "it refuses an order that is not the same set of photographs",
  /isSameSet\(photoIds/.test(reorder),
);
check("row by row rather than an upsert", /for \(const \{ id, sortOrder \} of sortOrderValues/.test(reorder));
check("and it is scoped to this report", /\.eq\("summary_report_id", reportId\)/.test(reorder));

console.log("\n5. Deselected photographs do not export, and nothing duplicates");

check(
  "the selection is validated against the project's own photographs",
  /\.from\("photos"\)\.select\("id"\)\.eq\("project_id", report\.project_id\)\.in\("id", requestedPhotos\)/.test(
    save,
  ),
  "a posted id from anywhere else cannot become a plate",
);
check(
  "one link per photograph is enforced by the database",
  /unique \(summary_report_id, photo_id\)/.test(
    read("../supabase/migrations/20260828000005_summary_reports.sql"),
  ),
);
check(
  "a survey's issue-only save still cannot empty the plates",
  /const photosIncluded = formData\.get\("photosIncluded"\) !== null/.test(save) &&
    /if \(photosIncluded\) \{/.test(save),
);
check(
  "and the issue selection is still replaced wholesale",
  /\.from\("summary_report_issues"\)\s*\n\s*\.delete\(\)/.test(save),
);

console.log("\n6. Provenance and immutability are untouched");

check("an issued report refuses the save", /SUMMARY_REPORT_IS_FINAL/.test(save));
check("and refuses a reorder", /editableReport/.test(reorder));
check(
  "the source record still records where the photographs came from",
  /summary_report_sources/.test(actions),
);
check(
  "photographs are still attached from the selected source reports at creation",
  /\.in\("report_id", sourceDailyIds\)/.test(actions),
);
check(
  "and deleting the report still leaves the photographs on the project",
  /belong to the project, not to this report/.test(actions),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL SUMMARY PHOTO CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
