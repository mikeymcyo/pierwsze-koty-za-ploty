/**
 * Building a Progress Report from the Daily Reports somebody actually chose.
 *
 * The Progress Report used to take every issued Daily Report inside a date
 * range. A range is a guess dressed as a decision: it swept in reports already
 * consolidated elsewhere, it could not express "the three days that mattered",
 * and the period it printed was the range asked for rather than the evidence
 * used. The reports are now picked one at a time, and what is ticked is what
 * the source record says.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:progress-sources
 */

import { readFileSync } from "node:fs";

import {
  alreadyConsolidated,
  defaultDailySelection,
  resolveDailySelection,
  selectedPeriod,
} from "../lib/summary-reports/daily-selection.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../lib/ai/summary-prompt.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { reportStructure } from "../lib/report-structure.ts";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const daily = (id, number, date, usedIn = null) => ({
  id,
  number,
  date,
  issuedAt: `${date}T16:30:00.000Z`,
  usedIn,
});

const week = [
  daily("a", 1, "2026-08-03"),
  daily("b", 2, "2026-08-04"),
  daily("c", 3, "2026-08-05"),
  daily("d", 4, "2026-08-06"),
  daily("e", 5, "2026-08-07"),
];

console.log("\n1. What is ticked when the picker opens");

check(
  "everything not already consolidated",
  defaultDailySelection(week).join() === "a,b,c,d,e",
);

const partly = [daily("a", 1, "2026-08-03", 1), daily("b", 2, "2026-08-04", 1), ...week.slice(2)];
check(
  "and only what has not gone out before",
  defaultDailySelection(partly).join() === "c,d,e",
  defaultDailySelection(partly).join(),
);
check(
  "the ones already used are still offered, not hidden",
  alreadyConsolidated(partly).length === 2 && partly.length === 5,
);
check(
  "where every report has gone out, nothing is preselected",
  defaultDailySelection(week.map((report) => ({ ...report, usedIn: 2 }))).length === 0,
  "repeating a whole period should be a decision somebody makes on purpose",
);
check("and an empty project selects nothing", defaultDailySelection([]).length === 0);

console.log("\n2. The form is a request, never an authority");

check(
  "what was ticked is what is used",
  resolveDailySelection(["b", "d"], week).map((report) => report.id).join() === "b,d",
);
check(
  "in the order the reports were issued, not the order they were ticked",
  resolveDailySelection(["e", "a", "c"], week).map((report) => report.id).join() === "a,c,e",
);
check(
  "an id that is not an issued daily on this project cannot become a source",
  resolveDailySelection(["a", "not-a-report", "another-company"], week)
    .map((report) => report.id)
    .join() === "a",
);
check(
  "and the same id twice is still one source row",
  resolveDailySelection(["c", "c", "c"], week).length === 1,
  "no duplicate source rows",
);
check("nothing ticked is nothing used", resolveDailySelection([], week).length === 0);
check("and nothing available is nothing used", resolveDailySelection(["a"], []).length === 0);

console.log("\n3. The period the document states");

check(
  "is the span of what was chosen",
  JSON.stringify(selectedPeriod(resolveDailySelection(["b", "d"], week))) ===
    JSON.stringify({ start: "2026-08-04", end: "2026-08-06" }),
);
check(
  "one report is a single day, not a range it did not cover",
  JSON.stringify(selectedPeriod(resolveDailySelection(["c"], week))) ===
    JSON.stringify({ start: "2026-08-05", end: "2026-08-05" }),
);
check(
  "the span is ordered by date, whatever order the reports arrive in",
  JSON.stringify(selectedPeriod([daily("z", 9, "2026-08-09"), daily("y", 8, "2026-08-01")])) ===
    JSON.stringify({ start: "2026-08-01", end: "2026-08-09" }),
);
check("and nothing selected claims no period", selectedPeriod([]) === null);

console.log("\n4. The write honours the selection");

const actions = read("../app/(app)/summary-reports/actions.ts");
check("the chosen reports are read from the form", /formData\.getAll\("reportIds"\)/.test(actions));
check(
  "deduplicated before they are even validated",
  /Array\.from\(new Set\(formData\.getAll\("reportIds"\)/.test(actions),
);
check("and validated as uuids", /reportIds: z\.array\(z\.uuid\(\)\)/.test(actions));
check(
  "a progress report consolidates the selection, not a date range",
  /input\.kind === "progress" && !standalone\s*\?\s*resolveDailySelection\(input\.reportIds, available\)/.test(
    actions,
  ),
);
check(
  "which is intersected with what this company may actually read",
  /resolveDailySelection\(input\.reportIds, available\)/.test(actions) &&
    /\.eq\("project_id", input\.projectId\)[\s\S]{0,120}\.eq\("status", "final"\)/.test(actions),
);
check(
  "a progress report told to consolidate nothing says so",
  /Choose at least one Daily Report to consolidate/.test(actions),
);
check(
  "and one whose choices are all gone says that instead",
  /None of the reports you chose are still issued Daily Reports/.test(actions),
);
check(
  "the stated period follows the selection when the author left it blank",
  /selectedPeriod\(daily\)/.test(actions),
);
check(
  "but an author who typed dates keeps them",
  /const periodStart = input\.periodStart \?\? span\?\.start \?\? null/.test(actions),
);
check("and the report is created with the resolved period", /period_start: periodStart/.test(actions));

console.log("\n5. Photographs, issues and provenance follow the selection");

check(
  "photographs come from the selected reports only",
  /const sourceDailyIds = daily\.map\(\(report\) => report\.id\)/.test(actions) &&
    /\.in\("report_id", sourceDailyIds\)/.test(actions),
);
check("one source row per chosen report", /report_id: report\.id,\s*\n\s*sort_order: order\+\+/.test(actions));
check(
  "and the whole report is thrown away if the evidence cannot be recorded",
  /await supabase\.from\("summary_reports"\)\.delete\(\)\.eq\("id", summary\.id\)/.test(actions),
  "a report that silently lost its provenance would be worse than no report",
);
check("issues are still snapshotted at issue", /status_at_issue: issue\.status/.test(actions));

// A Completion Report is unchanged: it prefers issued Progress Reports and
// keeps every underlying daily as `via` provenance.
check("a completion report still plans its own provenance", /completionSourcePlan\(/.test(actions));
check("and still records the underlying dailies as via", /via_summary_report_id/.test(actions));

console.log("\n6. The picker on screen");

const form = read("../components/summary-reports/summary-create-form.tsx");
const page = read("../app/(app)/summary-reports/new/page.tsx");

check("issued Daily Reports are offered one at a time", /type="checkbox"/.test(form));
check("under the name the field posts", /name="reportIds"/.test(form));
check("the number is shown", /Daily Report \{formatReportNumber\(daily\.number\)\}/.test(form));
check("the date is shown", /formatDate\(daily\.date\)/.test(form));
check("and the time it was issued", /issued \$\{new Date\(daily\.issuedAt\)/.test(form));
check(
  "a report already consolidated says where it went",
  /already in Progress Report/.test(form),
);
check("select all and clear are offered", /Select all/.test(form) && /Clear/.test(form));
check("and the count is announced", /aria-live="polite"/.test(form));
check(
  "the picker is for a consolidating progress report only",
  /kind === "progress" && sourceMode === "sources"/.test(form),
);
check(
  "a project with nothing issued is told so rather than shown an empty list",
  /no issued Daily Reports yet/.test(form),
);
check(
  "rows are at least as tall as the touch token",
  /min-h-\(--ui-control-min\)/.test(form),
  "chosen standing up on an iPad",
);
check(
  "the explanation no longer promises every report in the period",
  !/Leave the dates blank to use every one on the project/.test(form),
);
check("and says only ticked reports are listed in the PDF", /Only the Daily Reports you tick/.test(form));

check("the server decides what may be consolidated", /async function selectableDailies/.test(page));
check("reading only issued reports", /\.eq\("status", "final"\)/.test(page));
check("of the chosen project", /\.eq\("project_id", projectId\)/.test(page));
check(
  "and marking those an issued Progress Report already carries",
  /usedIn: usedIn\.get\(report\.id\) \?\? null/.test(page),
);
check(
  "the project select navigates so the server can answer",
  /router\.replace\(`\/summary-reports\/new\?kind=\$\{kind\}&project=\$\{next\}`\)/.test(form),
);

console.log("\n7. Structure: two writing areas, three headings");

const progress = reportStructure("progress");
check("three visible groups", progress.length === 3);
check("Progress Overview", progress[0].label === "Progress Overview");
check("Photos & Evidence", progress[1].label === "Photos & Evidence");
check("Outstanding / Next Actions", progress[2].label === "Outstanding / Next Actions");
check(
  "and only two of them are written in",
  progress.filter((group) => group.sections.length > 0).length === 2,
  progress.map((group) => `${group.label}:${group.sections.length}`).join(" "),
);
check(
  "an editor with no sections renders nothing at all",
  /if \(parts\.length === 0\) return null;/.test(read("../components/reports/group-editor.tsx")),
);

console.log("\n8. Consolidated by activity, not by day");

check(
  "the consolidator is told the evidence is a set of daily diaries",
  /A PROGRESS REPORT, CONSOLIDATED FROM DAILY REPORTS/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "and that the report is not one",
  /is not a diary and is not a list of days/.test(SUMMARY_SYSTEM_PROMPT),
);
check("consolidate by activity", /consolidate by activity, not by date/.test(SUMMARY_SYSTEM_PROMPT));
check(
  "the same work across four days is one statement",
  /is ONE statement about that wall/.test(SUMMARY_SYSTEM_PROMPT),
);
check("the last state of a work wins", /the last state wins/.test(SUMMARY_SYSTEM_PROMPT));
check(
  "resources are never totalled across days",
  /Never total or average them across days/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "an issue raised and later resolved is one issue",
  /is one issue, resolved/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "procurement is not completed work here either",
  /never work\s+completed - it is outstanding/.test(SUMMARY_SYSTEM_PROMPT),
);

// The safeguards the consolidator already had.
check(
  "nothing may be added that the evidence does not carry",
  /never add a fact, quantity, cause, status, certification, approval, inspection/.test(
    SUMMARY_SYSTEM_PROMPT,
  ),
);
check("silence is still not absence", /Silence is not evidence of absence/.test(SUMMARY_SYSTEM_PROMPT));
check(
  "and a reviewed progress report still outranks the dailies beneath it",
  /must not be counted again/.test(SUMMARY_SYSTEM_PROMPT),
);

console.log("\n9. The pipeline is unchanged");

const aiActions = read("../app/(app)/summary-reports/ai-actions.ts");
check("cleanup runs before the consolidating draft", aiActions.indexOf("cleanedSectionsFor") < aiActions.indexOf("generateSummarySections"));
check("the evidence is the selected reports' own notes", /raw_notes/.test(aiActions));
check("hand-written sections are still protected", /partitionDraft/.test(aiActions));
check(
  "progress still has its own cleanup briefs",
  CLEANUP_SECTIONS.progress.length > 0 &&
    CLEANUP_SECTIONS.progress.some((section) => section.type === "period_summary"),
);
check(
  "the Master Review still looks for duplication",
  /Duplication\. The same fact stated in two sections/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check("contradictions", /CONTRADICTIONS - FLAG, NEVER RESOLVE/.test(MASTER_REVIEW_SYSTEM_PROMPT));
check(
  "unresolved issues",
  /an issue with no recorded resolution/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and gaps that matter at consolidated level rather than daily level",
  /On a PROGRESS, COMPLETION or SURVEY report/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n10. Nothing was migrated");

const migrations = readFileSync(
  new URL("../supabase/migrations/20260828000005_summary_reports.sql", import.meta.url),
  "utf8",
);
check(
  "summary_report_sources already held one row per source",
  /create table public\.summary_report_sources/.test(migrations),
);
check("and already knew about via provenance", /via_summary_report_id/.test(migrations));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PROGRESS SOURCE CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
