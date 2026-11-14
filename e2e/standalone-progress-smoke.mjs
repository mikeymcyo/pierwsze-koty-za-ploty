/**
 * A Progress Report written directly, with no Daily Reports behind it.
 *
 * Run with the TSX loader:
 *   npm run test:standalone
 *
 * Two things are being protected at once, and the second is the important one:
 *
 * 1. A Progress Report can be produced for a period the site manager spent off
 *    site, from what operatives sent them - notes, photographs, issues.
 * 2. Such a report never claims it came from Daily Reports. No source rows, no
 *    source record in the PDF, and a drafting prompt told plainly there are
 *    none.
 *
 * The existing consolidating workflow is checked here too, because "do not
 * weaken it" is part of the same job.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";

import { textJoined } from "./support/pdf-tree.mjs";

import {
  NO_DAILY_REPORTS,
  SUMMARY_SOURCE_MODES,
  describeProvenance,
  evidenceHeading,
  isStandalone,
  noSourcesMessage,
  provenanceInstruction,
  sourceModeOf,
} from "../lib/summary-reports/provenance.ts";
import { canFinaliseSummary } from "../lib/summary-reports/finalisation.ts";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

function summary(overrides = {}) {
  return {
    kind: "progress",
    companyName: "Empire Interiors Ltd",
    projectName: "South Croydon",
    client: "Riverside Developments Ltd",
    siteAddress: "14 Wharf Road, South Croydon",
    projectReference: "1470",
    title: null,
    number: "007",
    revision: 0,
    periodLabel: "1 to 14 August 2026",
    issuedAt: "15 August 2026",
    issuedBy: "M. Korzeniak",
    sections: [
      { type: "period_summary", label: "Period summary", content: "Ducting continued to the east." },
    ],
    issues: [],
    photos: [],
    sourceLabels: [],
    supportingDocuments: [],
    documentsAppended: false,
    store: null,
    ...overrides,
  };
}

console.log("\n1. Two ways to write a Progress Report");
check("both modes exist", SUMMARY_SOURCE_MODES.join() === "sources,standalone");
check("consolidating stays the default", sourceModeOf(undefined) === "sources" && sourceModeOf("") === "sources");
check("and anything unrecognised keeps the old path", sourceModeOf("nonsense") === "sources");
check("writing directly is asked for explicitly", sourceModeOf("standalone") === "standalone");
check(
  "a report knows which it is from whether it has sources",
  isStandalone(0) && !isStandalone(1) && !isStandalone(9),
);
const rules = read("../lib/summary-reports/provenance.ts");
check("the rules import nothing at runtime", !/^import /m.test(rules));
check("so they can be tested and used on either side", !/@\//.test(rules));

console.log("\n2. It can actually be issued");
check(
  "a standalone progress report with something written can be finalised",
  canFinaliseSummary({ status: "draft", kind: "progress", sourceCount: 0, sectionCount: 2 }).ok,
);
check(
  "but it still has to say something",
  !canFinaliseSummary({ status: "draft", kind: "progress", sourceCount: 0, sectionCount: 0 }).ok,
);
check(
  "a consolidating progress report is unchanged",
  canFinaliseSummary({ status: "draft", kind: "progress", sourceCount: 3, sectionCount: 2 }).ok,
);
check(
  // Was: a completion report needed a source. A job can finish without a
  // Daily Report ever having been filed, and the absence is stated rather
  // than hidden - no source record, a screen that says so, and a prompt
  // forbidding the claim - so the check was protecting nothing.
  "a completion report may be written directly too",
  canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 0, sectionCount: 4 }).ok,
);
check(
  "but no document may be issued with nothing written in it",
  !canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 0, sectionCount: 0 }).ok &&
    !canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 5, sectionCount: 0 }).ok,
);
check(
  "and a survey is as it was",
  canFinaliseSummary({ status: "draft", kind: "survey", sourceCount: 0, sectionCount: 1 }).ok,
);
check(
  "an issued report of any kind stays immutable",
  !canFinaliseSummary({ status: "final", kind: "progress", sourceCount: 0, sectionCount: 2 }).ok,
);

console.log("\n3. It never claims a provenance it does not have");
const standaloneDoc = createElement(SummaryReportDocument, { data: summary() });
const text = textJoined(standaloneDoc);
check("no source record is printed", !text.includes("Source record"));
check("and no daily report is named", !/daily report/i.test(text));
check("the document is still a Progress Report", /Progress Report/i.test(text));
const sourced = textJoined(
  createElement(SummaryReportDocument, {
    data: summary({ sourceLabels: ["Daily Report 008 · 12 August 2026"] }),
  }),
);
check("a consolidated one still prints its sources", sourced.includes("Source record"));
check("and names them", sourced.includes("Daily Report 008 · 12 August 2026"));
check(
  "the screen says which kind of report this is",
  /no Daily Reports behind it/.test(describeProvenance("progress", 0)) &&
    /Consolidated from 3 issued source reports/.test(describeProvenance("progress", 3)) &&
    /Consolidated from 1 issued source report\./.test(describeProvenance("progress", 1)) &&
    /site visit/.test(describeProvenance("survey", 0)),
);

console.log("\n4. The model is told the truth about what it is reading");
check(
  "consolidated evidence is labelled as issued",
  evidenceHeading("progress", false) === "ISSUED SOURCE EVIDENCE:",
);
check(
  "directly recorded information is not",
  /no daily reports/i.test(evidenceHeading("progress", true)) &&
    !/issued source/i.test(evidenceHeading("progress", true)),
);
check("a survey says it came from the visit", /visit/i.test(evidenceHeading("survey", true)));
const instruction = provenanceInstruction(true);
check("and the instruction spells it out", /NO SOURCE DAILY REPORTS/.test(instruction));
check(
  "including the phrases it must not use",
  /source reports/.test(instruction) && /daily records/.test(instruction),
);
check("a consolidated report gets no such instruction", provenanceInstruction(false) === null);
const generation = read("../lib/ai/summary-generation.ts");
check("the prompt uses the heading rather than a fixed one", /evidenceHeading\(input\.kind/.test(generation));
check("and carries the instruction", /provenanceInstruction\(Boolean\(input\.standalone\)\)/.test(generation));
check(
  "an empty standalone report is told what to do, not that its sources are empty",
  /input\.kind === "survey" \|\| input\.standalone/.test(generation),
);
const aiActions = read("../app/(app)/summary-reports/ai-actions.ts");
check(
  "a report with no sources drafts from what was typed into it",
  /const standalone = isStandalone\(\(sources \?\? \[\]\)\.length\)/.test(aiActions),
);
check(
  "labelled as this period's information, not as a survey",
  /SITE INFORMATION RECORDED FOR THIS PERIOD/.test(aiActions) &&
    /SURVEY NOTES RECORDED ON SITE/.test(aiActions),
);
check("and the generator is told which it is", /standalone,/.test(aiActions));
check(
  "photographs and issues still reach the draft",
  /photoCaptions/.test(aiActions) &&
    /CURATED PHOTOGRAPH CAPTIONS/.test(read("../lib/summary-reports/evidence.ts")) &&
    /issues: issueEvidence/.test(aiActions),
);

console.log("\n5. Creating one, without weakening the consolidating path");
const actions = read("../app/(app)/summary-reports/actions.ts");
check("the mode is read from the form", /sourceMode: sourceModeOf\(/.test(actions));
check(
  "either kind can be standalone, and it is the choice that decides",
  /const standalone = input\.sourceMode === "standalone";/.test(actions) &&
    !/input\.kind === "progress" && input\.sourceMode/.test(actions),
);
check(
  "a standalone completion does not go hunting for progress reports either",
  /input\.kind === "completion" && !standalone/.test(actions),
);
check(
  "a standalone report does not go looking for Daily Reports",
  /standalone\s*\n?\s*\? \{ data: \[\], error: null \}/.test(actions),
);
check("and freezes no sources at all", /if \(sources\.length > 0\)/.test(actions));
check(
  "the consolidating path still freezes every daily report in the period",
  /report_id: report\.id,\s*\n\s*sort_order: order\+\+/.test(actions),
);
check(
  "and still refuses an empty period, pointing at the other option",
  /!standalone && daily\.length === 0 && progressForCompletion\.length === 0/.test(actions) &&
    /noSourcesMessage\(input\.kind\)/.test(actions),
);
check(
  "the refusal explains the alternative, for either kind",
  /Write it directly/.test(NO_DAILY_REPORTS) &&
    /no final Daily Reports/i.test(NO_DAILY_REPORTS) &&
    /Write it directly/.test(noSourcesMessage("completion")) &&
    noSourcesMessage("progress") === NO_DAILY_REPORTS,
);
check(
  "a standalone report is never refused for having no sources",
  /Only a report that asked to consolidate/.test(actions),
);
check(
  "completion still prefers issued progress reports and keeps provenance",
  /completionSourcePlan/.test(actions) && /via_summary_report_id/.test(actions),
);
check(
  "issues on the project are still gathered for the period",
  /from\("issues"\)[\s\S]{0,400}relevantIssues/.test(actions),
);

console.log("\n6. On the screen");
const form = read("../components/summary-reports/summary-create-form.tsx");
check("the choice is offered", /From issued Daily Reports/.test(form) && /Write it directly/.test(form));
check(
  "for either kind, and named for what it draws on",
  /sourceModes\(kind\)\.map/.test(form) && /From issued reports/.test(form),
);
check("and it is sent with the form", /name="sourceMode"/.test(form));
const page = read("../app/(app)/summary-reports/[id]/page.tsx");
check(
  "a standalone report gets the direct photo controls",
  /const direct = survey \|\| standalone/.test(page) && /direct \? \(\s*\n\s*<ReportPhotos/.test(page),
);
check(
  "which is the existing photo system, not a second one",
  /<ReportPhotos/.test(page) && !/PhotoUploadStandalone|StandalonePhoto/.test(page),
);
check("existing project photographs can still be picked", /available=\{availablePhotos\}/.test(page));
// A standalone report works its photographs in place, so its curation form is
// the issues-only one. It sits with the issues rather than with the plates.
check(
  "issues are still curated",
  /<SummaryCuration/.test(page) && /<SummaryCuration[^>]*showPhotos=\{false\}/.test(page),
);
check("supporting documents are untouched", /<DocumentPicker/.test(page) && /<DocumentUpload/.test(page));
check("and it says on the screen that it has no Daily Reports", /describeProvenance\(report\.kind, 0\)/.test(page));

console.log("\n7. Nothing was stored to make it work");
check(
  "the mode is not a column",
  !/source_mode|standalone/.test(read("../types/database.ts")),
);
check(
  "it is read from the sources a report has, which is where it always was",
  /isStandalone\(sources\.length\)/.test(page),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL STANDALONE PROGRESS CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
