/**
 * The Completion Report: the document a client keeps.
 *
 * It is read at final account, at practical completion, and in any dispute
 * about whether the job was done. Overstating its own outcome is the most
 * expensive fault this system can produce, so what is checked here is the
 * chain that stops it: which evidence it is built from, that no period is read
 * twice, that outstanding work is not filed under a heading reading
 * "Sign-off", that nothing may claim acceptance the records do not carry, and
 * that the document still lays out cleanly.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:completion-quality
 */

import { createElement } from "react";
import { readFileSync } from "node:fs";

import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

import { textJoined } from "./support/pdf-tree.mjs";

import {
  coveredDailyIds,
  defaultProgressSelection,
  progressPeriod,
  resolveProgressSelection,
  uncoveredDailyIds,
} from "../lib/summary-reports/progress-selection.ts";
import { completionSourcePlan } from "../lib/summary-reports/source-plan.ts";
import { COMPLETION_SECTIONS, SUMMARY_SECTION_LABELS } from "../lib/summary-reports/sections.ts";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../lib/ai/summary-prompt.ts";
import { reportStructure } from "../lib/report-structure.ts";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const progress = (id, number, start, end, dailyIds) => ({
  id,
  number,
  periodStart: start,
  periodEnd: end,
  issuedAt: `${end}T17:00:00.000Z`,
  dailyIds,
});

// Two issued Progress Reports covering four days each, and two later days that
// no Progress Report ever covered - the gap a Completion Report has to fill.
const issued = [
  progress("p1", 1, "2026-08-03", "2026-08-06", ["d1", "d2", "d3", "d4"]),
  progress("p2", 2, "2026-08-10", "2026-08-13", ["d5", "d6"]),
];
const allDailies = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];

console.log("\n1. Which Progress Reports the record is built from");

check("all of them, to begin with", defaultProgressSelection(issued).join() === "p1,p2");
check("and none where a project has none", defaultProgressSelection([]).length === 0);
check(
  "what was ticked is what is used",
  resolveProgressSelection(["p2"], issued).map((report) => report.id).join() === "p2",
);
check(
  "in issue order, not the order they were ticked",
  resolveProgressSelection(["p2", "p1"], issued).map((report) => report.id).join() === "p1,p2",
);
check(
  "an id that is not an issued Progress Report on this project cannot become a source",
  resolveProgressSelection(["p1", "somebody-elses"], issued).length === 1,
);
check(
  "and the same id twice is one source row",
  resolveProgressSelection(["p1", "p1"], issued).length === 1,
);
check(
  "the stated period spans what was chosen",
  JSON.stringify(progressPeriod(issued)) ===
    JSON.stringify({ start: "2026-08-03", end: "2026-08-13" }),
);
check("and claims none where the reports state none", progressPeriod([progress("p3", 3, null, null, [])]) === null);

console.log("\n2. A period is never read twice, and never lost");

check(
  "the days a chosen Progress Report covers are known",
  Array.from(coveredDailyIds(issued)).sort().join() === "d1,d2,d3,d4,d5,d6",
);
check(
  "and the days nothing covers are the gap",
  uncoveredDailyIds(allDailies, issued).join() === "d7,d8",
);
check(
  "unticking a Progress Report gives its days back as direct evidence",
  uncoveredDailyIds(allDailies, resolveProgressSelection(["p2"], issued)).join() ===
    "d1,d2,d3,d4,d7,d8",
  "deselecting a report must not lose its period from the record",
);
check(
  "ticking nothing means every day is read directly",
  uncoveredDailyIds(allDailies, []).join() === allDailies.join(),
);
check("and a duplicated day is still one day", uncoveredDailyIds(["d7", "d7"], issued).join() === "d7");

// The plan that actually writes the rows.
const plan = completionSourcePlan(
  allDailies,
  issued.map((report) => ({ id: report.id, dailyIds: report.dailyIds })),
);
check("every chosen Progress Report becomes a source", plan.progressIds.join() === "p1,p2");
check("every daily stays on the record", plan.daily.length === 8);
check(
  "a covered daily is recorded as provenance, under the report that covers it",
  plan.daily.find((row) => row.id === "d3")?.via === "p1" &&
    plan.daily.find((row) => row.id === "d5")?.via === "p2",
);
check(
  "and an uncovered one is a direct source",
  plan.daily.find((row) => row.id === "d7")?.via === null,
);

const aiActions = read("../app/(app)/summary-reports/ai-actions.ts");
check(
  "only uncovered dailies are fed to the writer",
  /\.filter\(\(source\) => source\.report_id && !source\.via_summary_report_id\)/.test(aiActions),
  "a fortnight consolidated twice would be said twice",
);
check(
  "while the chosen Progress Reports are fed as issued documents",
  /progressEvidence\.push\(/.test(aiActions) &&
    /ISSUED PROGRESS REPORT/.test(read("../lib/summary-reports/evidence.ts")),
  "the block is built in lib/summary-reports/evidence.ts, where it can be tested",
);
check(
  "and the writer is told which to prefer",
  /Prefer an issued progress report's reviewed wording/.test(SUMMARY_SYSTEM_PROMPT) &&
    /must not be counted again/.test(SUMMARY_SYSTEM_PROMPT),
);

console.log("\n3. The write honours the selection");

const actions = read("../app/(app)/summary-reports/actions.ts");
check("the chosen reports are read from the form", /formData\.getAll\("progressIds"\)/.test(actions));
check(
  "deduplicated before validation",
  /Array\.from\(new Set\(formData\.getAll\("progressIds"\)/.test(actions),
);
check("and validated as uuids", /progressIds: z\.array\(z\.uuid\(\)\)/.test(actions));
check(
  "intersected with what this company may read",
  /resolveProgressSelection\(input\.progressIds, availableProgress\)/.test(actions),
);
check(
  "a report started without a selection still gets every issued Progress Report",
  /input\.progressIds\.length > 0[\s\S]{0,120}: availableProgress/.test(actions),
  "falling back to none would turn a whole-project record into one built from raw dailies",
);
check(
  "a standalone completion report still consolidates nothing",
  /input\.kind === "completion" && !standalone/.test(actions),
);

console.log("\n4. Outstanding work is not filed under Sign-off");

check(
  "the section a reader sees is named for both jobs",
  SUMMARY_SECTION_LABELS.sign_off === "Outstanding and sign-off",
  SUMMARY_SECTION_LABELS.sign_off,
);
const signOff = COMPLETION_SECTIONS.find((section) => section.type === "sign_off")?.brief ?? "";
const signOffCleanup =
  CLEANUP_SECTIONS.completion.find((section) => section.type === "sign_off")?.brief ?? "";
for (const [where, brief] of [
  ["drafting", signOff],
  ["cleanup", signOffCleanup],
]) {
  check(`${where}: outstanding work comes first`, /outstanding/i.test(brief), brief);
  check(`${where}: follow-on work has a home`, /follow-on/i.test(brief), brief);
  check(
    `${where}: and nothing may claim acceptance the records do not carry`,
    /accepted, handed over, approved, tested, commissioned, certified or signed off/.test(brief),
    brief,
  );
}
check(
  "the cleanup brief used to drop outstanding work entirely",
  /Two things, in this order/.test(signOffCleanup),
  "it asked only for sign-off facts, so follow-on work had nowhere to go",
);
check(
  "the stored section type is unchanged - this is a label, not a migration",
  COMPLETION_SECTIONS.some((section) => section.type === "sign_off"),
);

console.log("\n5. The strictest review in the system");

check(
  "a completion report is named as the highest bar",
  /A COMPLETION REPORT IS THE HIGHEST BAR IN THIS SYSTEM/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check("and why", /the document a client keeps/.test(MASTER_REVIEW_SYSTEM_PROMPT));
for (const claim of [
  "completed",
  "accepted",
  "handed over",
  "approved",
  "inspected",
  "tested",
  "commissioned",
  "certified",
  "compliant",
]) {
  check(
    `"${claim}" must be traceable`,
    new RegExp(claim).test(MASTER_REVIEW_SYSTEM_PROMPT),
  );
}
check(
  "an untraceable claim is cut, not reworded",
  /CUT THE CLAIM and raise a warning naming the section/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
for (const [what, pattern] of [
  ["an unresolved issue reads as a defect handed over", /a defect handed over/],
  ["scope and completed works describing the same list", /describing the same list/],
  ["stages repeating the scope", /repeating the scope rather than the sequence/],
  ["an outstanding item with nowhere to live", /appears nowhere in Outstanding and sign-off/],
  ["a sign-off sentence with no source", /a sign-off sentence with no source behind it/],
]) {
  check(`it looks for ${what}`, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}
// Stricter than the daily, which was deliberately made proportionate.
const daily = MASTER_REVIEW_SYSTEM_PROMPT.slice(
  MASTER_REVIEW_SYSTEM_PROMPT.indexOf("On a DAILY report"),
  MASTER_REVIEW_SYSTEM_PROMPT.indexOf("On a PROGRESS, COMPLETION or SURVEY report"),
);
check("while a daily is still told to be proportionate", /do NOT ask for a supplier/.test(daily));
check(
  "and a completion report is still told the opposite",
  /especially on a completion report/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "contradictions are still flagged rather than resolved",
  /CONTRADICTIONS - FLAG, NEVER RESOLVE/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n6. The picker on screen");

const form = read("../components/summary-reports/summary-create-form.tsx");
const page = read("../app/(app)/summary-reports/new/page.tsx");

check("Progress Reports are offered one at a time", /name="progressIds"/.test(form));
check("with their number", /Progress Report \{formatReportNumber\(report\.number\)\}/.test(form));
check("their period", /formatDate\(report\.periodStart\)/.test(form));
check("and how many days sit beneath each", /beneath it/.test(form));
check(
  "the gap is stated in plain words",
  /will be used as evidence for the gap/.test(form),
);
check(
  "and so is the case where there is none",
  /None will be read a second time/.test(form),
);
check("select all and clear are offered", /onNone=\{\(\) => setSelectedProgress\(new Set\(\)\)\}/.test(form));
check("the picker is for a consolidating completion report", /kind === "completion" && sourceMode === "sources"/.test(form));
check(
  "a project with no Progress Reports is told what will happen instead",
  /no issued Progress Reports/.test(form),
);
check("rows meet the touch token", /min-h-\(--ui-control-min\)/.test(form));
check("the server decides what may be consolidated", /async function selectableProgress/.test(page));
check("reading issued progress reports only", /\.eq\("kind", "progress"\)[\s\S]{0,60}\.eq\("status", "final"\)/.test(page));
check("with the days each one covers", /dailyIdsByReport/.test(page));

console.log("\n7. Photographs stay the author's");

const detail = read("../app/(app)/summary-reports/[id]/page.tsx");
check("photographs are curated on the report", /SummaryCuration/.test(detail));
check("and reordered", /report-photos|ReportPhotos/.test(detail));
const curation = read("../components/summary-reports/summary-curation.tsx");
check("each photograph can be dropped from the document", /photoIds|checkbox/.test(curation));
check(
  "an issued report curates nothing",
  /isFinal/.test(detail) && /SUMMARY_REPORT_IS_FINAL/.test(actions),
);

console.log("\n8. The document still lays out cleanly");

const completionData = (overrides = {}) => ({
  kind: "completion",
  companyName: "Empire Interiors Ltd",
  projectName: "Lidl South Croydon",
  client: "Riverside Developments Ltd",
  siteAddress: "14 Wharf Road, South Croydon",
  projectReference: "1470",
  title: null,
  number: "002",
  revision: 0,
  periodLabel: "Whole project record",
  issuedAt: "1 September 2026",
  issuedBy: "M. Korzeniak",
  sections: COMPLETION_SECTIONS.map((section) => ({
    type: section.type,
    label: section.label,
    content: `${section.label} content for the completion record.`,
  })),
  issues: [],
  photos: [],
  sourceLabels: [
    "Progress Report 001 · 3 August 2026 to 6 August 2026",
    "Daily Report 007 · 14 August 2026",
  ],
  supportingDocuments: [],
  documentsAppended: false,
  store: null,
  ...overrides,
});

const buffer = await renderToBuffer(
  createElement(SummaryReportDocument, { data: completionData() }),
);
const pdf = await PDFDocument.load(buffer);
check("a full completion report renders", buffer.length > 0);
check(
  "and stays short enough to read",
  pdf.getPageCount() <= 3,
  `${pdf.getPageCount()} pages`,
);

const text = textJoined(createElement(SummaryReportDocument, { data: completionData() }));
check("it calls itself a Completion Report", /Completion Report/.test(text));
check("the outstanding heading reads for both jobs", /Outstanding and sign-off/.test(text));
check("the source record is printed", /Source record/.test(text));
check("naming the Progress Report it used", /Progress Report 001/.test(text));
check("and the uncovered day it read directly", /Daily Report 007/.test(text));
check(
  "a report with no sources claims none",
  !/Source record/.test(
    textJoined(createElement(SummaryReportDocument, { data: completionData({ sourceLabels: [] }) })),
  ),
);

console.log("\n9. Three headings, three writing areas");

const structure = reportStructure("completion");
check("three visible groups", structure.length === 3);
check("Completion Summary", structure[0].label === "Completion Summary");
check("Photos & Evidence", structure[1].label === "Photos & Evidence");
check("Outstanding / Follow-on", structure[2].label === "Outstanding / Follow-on");
check(
  "and no more than three writing areas",
  structure.filter((group) => group.sections.length > 0).length <= 3,
);
check(
  "every completion section still has a home",
  COMPLETION_SECTIONS.every((section) =>
    structure.some((group) => group.sections.includes(section.type)),
  ),
);

console.log("\n10. Nothing was migrated");

const migrations = read("../supabase/migrations/20260828000005_summary_reports.sql");
check("sign_off was already a section type", /sign_off/.test(migrations));
check("and no new one was needed", !/outstanding_and_sign_off/.test(migrations));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL COMPLETION QUALITY CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
