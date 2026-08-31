/**
 * A source-based Progress Report should not look like a blank page.
 *
 * A site manager ticked two Daily Reports, started a Progress Report, and was
 * shown empty writing boxes under a button reading "Write from evidence". He
 * read that as: the reports are gone, and I have to type the job again. They
 * had not gone anywhere - the evidence was frozen onto the document at
 * creation - but nothing on the screen said so.
 *
 * UX only. The evidence pipeline, the prompts, the provenance and the
 * photographs are untouched, and this suite asserts that too.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:progress-ux
 */

import { readFileSync } from "node:fs";

import {
  CONSOLIDATION_HELPER,
  describeSourceLine,
  generateLabel,
} from "../lib/summary-reports/source-summary.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const writer = read("../components/summary-reports/summary-draft.tsx");
const page = read("../app/(app)/summary-reports/[id]/page.tsx");

console.log("\n1. The button says what it will do, and to which reports");

check(
  "two dailies",
  generateLabel({ daily: [1, 2], progress: [] }, false) === "Generate from 2 Daily Reports",
  generateLabel({ daily: [1, 2], progress: [] }, false),
);
check(
  "and says regenerate once there is something to replace",
  generateLabel({ daily: [1, 2], progress: [] }, true) === "Regenerate from 2 Daily Reports",
);
check(
  "one daily is singular",
  generateLabel({ daily: [7], progress: [] }, false) === "Generate from 1 Daily Report",
);
check(
  "a completion report names both kinds",
  generateLabel({ daily: [9], progress: [1, 2] }, false) ===
    "Generate from 2 Progress Reports and 1 Daily Report",
  generateLabel({ daily: [9], progress: [1, 2] }, false),
);
check(
  "and a report with no sources does not pretend to have any",
  generateLabel({ daily: [], progress: [] }, false) === "Write from what you recorded",
);
check(
  "the old wording is gone from the button",
  !/hasContent \? "Regenerate from evidence" : "Write from evidence"/.test(writer),
  "it read as an instruction to start writing",
);
check("the button is built from the counts", /generateLabel\(sources, hasContent\)/.test(writer));

console.log("\n2. One line saying where the words will come from");

check(
  "two dailies are named",
  describeSourceLine({ daily: [1, 2], progress: [] }) === "Built from Daily Reports 001 and 002",
  String(describeSourceLine({ daily: [1, 2], progress: [] })),
);
check(
  "one is singular",
  describeSourceLine({ daily: [3], progress: [] }) === "Built from Daily Report 003",
);
check(
  "three read as a list",
  describeSourceLine({ daily: [1, 2, 3], progress: [] }) ===
    "Built from Daily Reports 001, 002 and 003",
);
check(
  "and beyond four it counts rather than lists",
  describeSourceLine({ daily: [1, 2, 3, 4, 5], progress: [] }) === "Built from 5 Daily Reports",
  "a month of dailies must not print twenty numbers in a line meant to reassure",
);
check(
  "a completion report names both",
  describeSourceLine({ daily: [9], progress: [1] }) ===
    "Built from Progress Report 001, plus Daily Report 009",
  String(describeSourceLine({ daily: [9], progress: [1] })),
);
check(
  "provenance beneath a progress report is counted, not named",
  describeSourceLine({ daily: [], progress: [1], viaDaily: 4 }) ===
    "Built from Progress Report 001 (and 4 Daily Reports beneath it, kept as provenance)",
  String(describeSourceLine({ daily: [], progress: [1], viaDaily: 4 })),
);
check(
  "and a report written directly claims nothing",
  describeSourceLine({ daily: [], progress: [] }) === null,
  "it has no sources and must never imply any",
);

check("the line is rendered near the top", /\{sourceLine \? \(/.test(page));
check("above the section cards", page.indexOf("sourceLine ? (") < page.indexOf("<ReportSectionCard"));
check("as one line, not a panel of links", /<p className="flex items-start gap-2 rounded-xl/.test(page));
check(
  "and the full list is still available further down",
  /Source evidence/.test(page),
  "behind Advanced details, where it always was",
);
check(
  "a daily reached through a progress report is counted as provenance",
  /viaDaily: sources\.filter\(\(source\) => source\.report_id && source\.via_summary_report_id\)/.test(
    page,
  ),
);

console.log("\n3. Typing is optional, and never looks required");

check("the helper text says so", /Add your own notes only if you want to provide extra context/.test(CONSOLIDATION_HELPER));
check("and that SiteBoss does the consolidating", /SiteBoss will consolidate/.test(CONSOLIDATION_HELPER));
check("it is shown on a consolidating report", /CONSOLIDATION_HELPER/.test(writer));
check(
  "a report written directly is told something else entirely",
  /Write each section below/.test(writer),
);
check(
  "the writing box is put away until there is something to correct",
  /consolidating && !hasWrittenSummary \?/.test(page),
);
check(
  "under a label that says it is optional",
  /Add your own notes \(optional\)/.test(page),
);
check(
  "and a report written directly keeps its writing surface",
  page.includes("consolidating && !hasWrittenSummary ?") &&
    /\) : \(\s*\n\s*<GroupEditor/.test(page),
);

console.log("\n4. The generate action is the dominant thing on an empty document");

check("dominance is decided by having sources and no words", /const dominant = consolidating && !hasContent/.test(writer));
check("and makes the button full width and taller", /dominant \? "h-14 w-full text-base" : undefined/.test(writer));
check(
  "the helper reads in full ink rather than muted when it matters",
  /dominant \? "text-sm text-ink" : "text-sm text-ink-muted"/.test(writer),
);

console.log("\n5. Nothing generates on its own");

check("there is no effect that fires the action", !/useEffect/.test(writer));
check("it is still a form somebody presses", /<form action=\{action\}>/.test(writer));
check(
  "and the comment says why",
  /A document that rewrote itself when somebody\s+\* opened it would be worse/.test(writer),
);

console.log("\n6. Nothing behind the screen moved");

const actions = read("../app/(app)/summary-reports/ai-actions.ts");
check("the evidence builder is untouched", /buildEvidence\(\{/.test(actions));
check("covered dailies are still excluded", /!source\.via_summary_report_id/.test(actions));
check("hand-written sections are still protected", /partitionDraft/.test(actions));
check("an issued report still refuses a redraft", /SUMMARY_REPORT_IS_FINAL/.test(actions));
check(
  "the photograph pipeline is untouched",
  /\.update\(\{ caption_override: caption \}\)/.test(read("../app/(app)/summary-reports/actions.ts")),
);
check("and the Master Review still has its own panel", /MasterReviewPanel/.test(page));
check(
  "provenance rows are still what the line is read from",
  /summary_report_sources/.test(page),
);
check(
  "an issued report shows its prose, not a generate button",
  /isFinal \? \(\s*\n\s*<SectionProse/.test(page),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PROGRESS UX CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
