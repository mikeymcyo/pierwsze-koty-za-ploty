/**
 * A Completion Report that does not contradict itself.
 *
 * Completion Report 002 said "all works completed successfully" in its Project
 * Overview and again, word for word, in Completed Works - while the same
 * document recorded localised concrete patch repairs still to be carried out.
 * Both sentences came from the evidence. Together they tell a client the job is
 * finished and, four paragraphs later, that it is not.
 *
 * Two things are checked here: the detector that finds that fault mechanically
 * before any model reads the document, and the section briefs that stop it
 * being written in the first place.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:completion-content
 */

import { readFileSync } from "node:fs";

import {
  CONTRADICTION_HEADING,
  blanketCompletionClaims,
  completionContradictions,
  completionStatusLine,
  outstandingMentions,
  repeatedSentences,
} from "../lib/summary-reports/completion-claims.ts";
import {
  COMPLETION_DRAFTED_TYPES,
  COMPLETION_SECTIONS,
  summaryDraftedSectionsFor,
} from "../lib/summary-reports/sections.ts";
import { groupSections } from "../lib/report-structure.ts";
import { proseBlocks } from "../lib/pdf/components.tsx";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../lib/ai/summary-prompt.ts";
import { buildEvidence } from "../lib/summary-reports/evidence.ts";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";
import { textJoined } from "./support/pdf-tree.mjs";
import { PORTRAIT } from "./support/fixture-image.mjs";
import { createElement } from "react";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const briefOf = (list, type) => list.find((section) => section.type === type)?.brief ?? "";
const drafting = (type) => briefOf(COMPLETION_SECTIONS, type);
const cleanup = (type) => briefOf(CLEANUP_SECTIONS.completion, type);

// Completion Report 002, as it was actually issued.
const issued002 = [
  {
    type: "project_overview",
    label: "Project overview",
    content:
      "The record relates to RDC Concrete Works at RDC Northfleet. The issued progress report records that all works had been completed successfully at the end of the week.",
  },
  { type: "scope_of_works", label: "Scope of works", content: "The package is identified as concrete works at RDC Northfleet." },
  {
    type: "completed_works",
    label: "Completed works",
    content: "The issued progress report records that all works had been completed successfully at the end of the week.",
  },
  {
    type: "sign_off",
    label: "Outstanding and sign-off",
    content:
      "The photographic record includes a caption identifying localised concrete patch repairs to be carried out around the second manhole at bay 39. The source evidence does not record any sign-off, handover or acceptance.",
  },
];

console.log("\n1. Outstanding work blocks an unconditional completion claim");

const claims = blanketCompletionClaims(issued002);
check("the blanket claim is found", claims.length === 2, String(claims.length));
check(
  "in both the sections that carried it",
  claims.map((claim) => claim.type).sort().join() === "completed_works,project_overview",
);
const outstanding = outstandingMentions(issued002);
check("and the outstanding work is found", outstanding.length === 1, String(outstanding.length));
check("in the section that recorded it", outstanding[0]?.type === "sign_off");

const contradictions = completionContradictions(issued002);
check(
  "the contradiction is raised",
  contradictions.some((entry) => entry.kind === "completion_vs_outstanding"),
);
check(
  "once for each claiming section",
  contradictions.filter((entry) => entry.kind === "completion_vs_outstanding").length === 2,
);
check(
  "quoting the claim so the reviewer has the sentence",
  contradictions[0]?.line.includes("all works had been completed successfully"),
);
check(
  "and quoting what refutes it",
  contradictions[0]?.line.includes("localised concrete patch repairs to be carried out"),
);
check(
  "and saying they cannot both be true",
  /Both cannot be true of this document/.test(contradictions[0]?.line ?? ""),
);

// A qualified claim names its scope and is not the fault.
const qualified = [
  {
    type: "project_overview",
    label: "Project overview",
    content:
      "The primary reinstatement works were completed, with localised patch repairs remaining at the second manhole.",
  },
];
check(
  "a claim that names what remains is not flagged",
  completionContradictions(qualified).filter((entry) => entry.kind === "completion_vs_outstanding")
    .length === 0,
  JSON.stringify(completionContradictions(qualified)),
);
check(
  "and a genuinely finished job is not flagged either",
  completionContradictions([
    { type: "completed_works", label: "Completed works", content: "All works were completed." },
    { type: "sign_off", label: "Outstanding and sign-off", content: "The client signed the handover certificate." },
  ]).length === 0,
);
check(
  "a completed activity is not a blanket claim",
  blanketCompletionClaims([
    { type: "completed_works", label: "Completed works", content: "The manhole was rebuilt in engineering brick." },
  ]).length === 0,
);
check("and an empty document raises nothing", completionContradictions([]).length === 0);

console.log("\n2. The same sentence is not printed twice");

const repeats = repeatedSentences(issued002);
check("the duplicated sentence is found", repeats.length === 1, String(repeats.length));
check(
  "naming both sections",
  repeats[0]?.sections.join() === "Project overview,Completed works",
  JSON.stringify(repeats[0]?.sections),
);
check(
  "and it is raised to the reviewer",
  contradictions.some((entry) => entry.kind === "repeated_sentence"),
);
check(
  "with the instruction to keep it in one",
  contradictions.find((entry) => entry.kind === "repeated_sentence")?.line.includes("belongs in one of them"),
);
check(
  "a short fragment repeating is not a duplication",
  repeatedSentences([
    { type: "a", label: "A", content: "Not recorded." },
    { type: "b", label: "B", content: "Not recorded." },
  ]).length === 0,
);
check(
  "and punctuation does not hide one",
  repeatedSentences([
    { type: "a", label: "A", content: "The manhole was rebuilt using engineering bricks and mortar." },
    { type: "b", label: "B", content: "the manhole was rebuilt using engineering bricks and mortar" },
  ]).length === 1,
);

console.log("\n3. The reviewer is handed the contradictions, not asked to notice");

const context = read("../lib/reports/review-context.ts");
check("they are computed for the reviewer", /completionContradictions\(/.test(context));
check("from the document's own sections", /content: section\.content/.test(context));
check("under a heading that says what to do", /needs a warning, and the unsupported claim cut or qualified/.test(CONTRADICTION_HEADING));
check(
  "an empty block is dropped rather than printed",
  /\.filter\(\(block\) => block\.lines\.length > 0\)/.test(read("../lib/ai/master-review-prompt.ts")),
  "a clean document costs nothing",
);
check(
  "the reviewer is told the block is real, not a suggestion",
  /Those were found by reading the document itself, not by a model/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and that none may be left unremarked",
  /do not leave one unremarked/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "a completion claim contradicted by outstanding work is cut, not merely flagged",
  /THE ONE EXCEPTION TO\s+FLAG-NEVER-RESOLVE/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "replaced with what was completed and what remains",
  /what was actually completed and what remains/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "everything else is still flagged and never resolved",
  /Everything else: where two parts of the report disagree/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n4. Three sections the client reads, and they are distinct");

check(
  "a completion report is drafted in three",
  COMPLETION_DRAFTED_TYPES.join() === "project_overview,completed_works,sign_off",
  COMPLETION_DRAFTED_TYPES.join(),
);
check(
  "the summary, the completed works, and what is still open",
  summaryDraftedSectionsFor("completion").map((section) => section.label).join(" | ") ===
    "Completion summary | Completed works | Outstanding and sign-off",
  summaryDraftedSectionsFor("completion").map((section) => section.label).join(" | "),
);
check("and cleanup writes the same three", CLEANUP_SECTIONS.completion.length === 3);
check(
  "the model is asked for those and nothing else",
  /const definitions = summaryDraftedSectionsFor\(input\.kind\)/.test(
    read("../lib/ai/summary-generation.ts"),
  ),
);

// Nothing was removed. Every stored type is still stored, still editable, and
// still printed where somebody wrote it - a report drafted before this, or one
// where a stage sequence was written by hand, prints exactly as it did.
check("a completion report still stores eight sections", COMPLETION_SECTIONS.length === 8);
for (const type of ["scope_of_works", "stages_of_works", "key_technical_activities", "photographic_record", "issues_and_resolutions"]) {
  check(
    `${type} is still stored, just not asked for`,
    COMPLETION_SECTIONS.some((section) => section.type === type) &&
      !COMPLETION_DRAFTED_TYPES.includes(type),
  );
}
check(
  "and a section that carries words still prints",
  groupSections("completion", [
    { type: "stages_of_works", content: "Somebody wrote this by hand." },
  ])
    .flatMap((entry) => entry.entries)
    .some((entry) => entry.type === "stages_of_works"),
  "no paragraph anybody wrote is dropped",
);
check(
  "only an AI-written section is ever cleared on a redraft",
  /\.eq\("ai_generated", true\)/.test(read("../app/(app)/summary-reports/ai-actions.ts")),
);

for (const [where, brief] of [["drafting", drafting("project_overview")], ["cleanup", cleanup("project_overview")]]) {
  check(`${where}: the summary is the executive account`, /executive account|story of the job/i.test(brief), brief);
  check(`${where}: it stands on its own`, /stand on its own/i.test(brief), brief);
  check(
    `${where}: and is told not to list the completed activities`,
    /NOT list the completed activities|Not a list of the completed activities/i.test(brief),
    brief,
  );
  check(
    `${where}: and to qualify the outcome where anything remains`,
    /never that all works are complete/i.test(brief),
    brief,
  );
}
for (const [where, brief] of [["drafting", drafting("completed_works")], ["cleanup", cleanup("completed_works")]]) {
  check(
    `${where}: completed works keeps the technical facts`,
    /materials/i.test(brief) && /locations/i.test(brief) && /quantities/i.test(brief),
    brief,
  );
  check(
    `${where}: planned and awaited work is excluded`,
    /planned, programmed, awaited or still to be carried out/i.test(brief),
    brief,
  );
  check(
    `${where}: it never repeats the summary`,
    /do not repeat (a sentence from )?the (project overview|completion summary)/i.test(brief),
    brief,
  );
  check(
    `${where}: and a blanket sentence is refused outright`,
    /all works were completed successfully/i.test(brief) && /does not belong in this section/i.test(brief),
    brief,
  );
}
check(
  "the summary and the completed works are materially different briefs",
  drafting("project_overview") !== drafting("completed_works") &&
    cleanup("project_overview") !== cleanup("completed_works"),
);
const signOff = drafting("sign_off");
check("outstanding work comes before sign-off", /Two things, in this order/.test(signOff));
check(
  "and sign-off is only ever what a record says",
  /Never write that the works were accepted, handed over, approved, tested, commissioned, certified or signed off/.test(
    signOff,
  ),
);
check(
  "the three briefs are all different",
  new Set([drafting("project_overview"), drafting("completed_works"), signOff]).size === 3,
);

console.log("\n4b. What the client actually receives");

const completionData = (sections) => ({
  kind: "completion",
  companyName: "Empire Interiors Ltd",
  projectName: "RDC Northfleet",
  client: "Lidl GB",
  siteAddress: "Northfleet",
  projectReference: "1470",
  title: null,
  number: "004",
  revision: 0,
  periodLabel: "Whole project record",
  issuedAt: "1 September 2026",
  issuedBy: "M. Korzeniak",
  sections,
  issues: [],
  photos: [],
  sourceLabels: ["Progress Report 001 · 3 August 2026 to 6 August 2026"],
  supportingDocuments: [],
  documentsAppended: false,
  store: null,
});

// A report drafted under the new rules: three written sections, the rest empty.
const drafted = summaryDraftedSectionsFor("completion").map((section) => ({
  type: section.type,
  label: section.label,
  content: `${section.label} content.`,
}));
const clientFacing = textJoined(
  createElement(SummaryReportDocument, { data: completionData(drafted) }),
);

check("the completion summary heading prints", /Completion Summary/i.test(clientFacing));
// The evidence heading appears when there are plates, and is correctly absent
// when there are none - a heading with nothing under it is not printed.
check("photos and evidence is absent when there are no plates", !/Photos & Evidence/i.test(clientFacing));
const withPlates = textJoined(
  createElement(SummaryReportDocument, {
    data: {
      ...completionData(drafted),
      photos: [{ id: "p1", caption: "The rebuilt manhole.", category: "general", data: PORTRAIT }],
    },
  }),
);
check("and prints once there are", /Photos & Evidence/i.test(withPlates));
check("with the caption the report carries", withPlates.includes("The rebuilt manhole."));
check("outstanding and follow-on prints", /Outstanding \/ Follow-on/i.test(clientFacing));
check("and the source record prints", /Source record/i.test(clientFacing));
for (const gone of ["Scope of works", "Stages of works", "Key technical activities", "Photographic record"]) {
  check(
    `${gone} is not printed when it was never drafted`,
    !clientFacing.includes(gone),
    "empty sections are dropped by lib/summary-reports/pdf-data.ts",
  );
}

// And the promise that nothing anybody wrote is lost: a hand-written stage
// sequence on an older report still prints.
const withLegacy = textJoined(
  createElement(SummaryReportDocument, {
    data: completionData([
      ...drafted,
      { type: "stages_of_works", label: "Stages of works", content: "Phase one, then phase two." },
    ]),
  }),
);
check(
  "a section somebody wrote by hand still prints",
  withLegacy.includes("Phase one, then phase two."),
);
check("under its own run-in label", /Stages of works/.test(withLegacy));

console.log("\n4c. The status a client reads first");

check("nothing written claims no status", completionStatusLine([]) === null);
check(
  "a report with open work says so",
  completionStatusLine(issued002) === "Primary works completed - follow-on works outstanding",
  String(completionStatusLine(issued002)),
);
check(
  "and never claims full completion while anything remains",
  !/^Works completed$/.test(completionStatusLine(issued002) ?? ""),
);
check(
  "an open issue is outstanding even where the prose says nothing",
  completionStatusLine(
    [{ type: "completed_works", label: "Completed works", content: "All works were completed." }],
    1,
  ) === "Primary works completed - follow-on works outstanding",
);
check(
  "a finished job says so",
  completionStatusLine(
    [{ type: "completed_works", label: "Completed works", content: "All works were completed." }],
    0,
  ) === "Works completed",
);
check(
  "and a report that never mentions completion claims none",
  completionStatusLine(
    [{ type: "completed_works", label: "Completed works", content: "The manhole was rebuilt." }],
    0,
  ) === null,
  "a status nobody can substantiate is worse than none",
);

const statusText = textJoined(
  createElement(SummaryReportDocument, {
    data: {
      ...completionData(drafted),
      sections: issued002.map((section) => ({
        type: section.type,
        label: section.label,
        content: section.content,
      })),
    },
  }),
);
check("it prints on the document", statusText.includes("Primary works completed"), statusText.slice(0, 200));
check("under a plain label", /Status/.test(statusText));
check(
  "a progress report gets no completion status",
  !textJoined(
    createElement(SummaryReportDocument, {
      data: { ...completionData(drafted), kind: "progress", number: "007" },
    }),
  ).includes("Primary works completed"),
);

console.log("\n4d. How it reads, and how it lists");

for (const brief of [drafting("project_overview"), cleanup("project_overview")]) {
  check(
    "the summary is told not to write in legal register",
    /completion position is limited to/i.test(brief),
    brief,
  );
}
check(
  "and the consolidator too, with the sentence it should write instead",
  /the main reinstatement works are complete,/.test(SUMMARY_SYSTEM_PROMPT),
);
for (const phrase of ["insofar as", "for the avoidance of", "the aforementioned"]) {
  check(`"${phrase}" is named as banned`, SUMMARY_SYSTEM_PROMPT.toLowerCase().includes(phrase));
}
for (const brief of [drafting("completed_works"), cleanup("completed_works")]) {
  check("several workstreams may be written as lines", /one (workstream )?per line|one workstream per line/i.test(brief), brief);
  check("and a single one stays as prose", /single workstream stays as prose/i.test(brief), brief);
}
check(
  "the consolidator is told the same, and told not to bullet one thing",
  /a bullet list of one is a paragraph/.test(SUMMARY_SYSTEM_PROMPT),
);

// The PDF has to draw those lines as lines.
check("a dash opens a workstream line", proseBlocks("- One\n- Two").every((block) => block.bullet));
check("and both survive", proseBlocks("- One\n- Two").map((block) => block.text).join() === "One,Two");
check(
  "prose with no list is exactly one block",
  proseBlocks("A sentence. And another.").length === 1,
  "every report written before this",
);
check(
  "a paragraph then lines comes back in order",
  proseBlocks("Intro line.\n- One\n- Two")
    .map((block) => `${block.bullet ? "*" : "p"}:${block.text}`)
    .join(" ") === "p:Intro line. *:One *:Two",
);
check("hard-wrapped prose stays one paragraph", proseBlocks("one\ntwo").length === 1);
check("an empty line separates paragraphs", proseBlocks("one\n\ntwo").length === 2);
check("and an empty marker is not a line", proseBlocks("- ").length === 0);

const bulleted = textJoined(
  createElement(SummaryReportDocument, {
    data: completionData([
      { type: "project_overview", label: "Completion summary", content: "The job overall." },
      {
        type: "completed_works",
        label: "Completed works",
        content: "- Manhole rebuilt in engineering brick.\n- C4 concrete placed to the main hall.",
      },
    ]),
  }),
);
check("both workstreams print", bulleted.includes("Manhole rebuilt") && bulleted.includes("C4 concrete placed"));
check("with a marker against each", (bulleted.match(/\u2013/g) ?? []).length >= 2);

console.log("\n5. The consolidator is told the same thing");

check(
  "a source's completion claim is not the project's",
  /COMPLETION STATUS: A SOURCE'S CLAIM IS NOT THE PROJECT'S/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "it must read the whole evidence for anything still open",
  /read the whole\s+evidence for anything still open/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "including a photograph caption",
  /in a photograph caption/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "the blanket wording is named and forbidden",
  /Never write "all works were completed"/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "and the true sentence is shown instead of only described",
  /the primary reinstatement\s+works were completed, with localised patch repairs remaining/.test(
    SUMMARY_SYSTEM_PROMPT,
  ),
);
check(
  "an outstanding item goes in one section, not three",
  /do not scatter them\s+through the other sections/.test(SUMMARY_SYSTEM_PROMPT),
);
check("no sentence twice", /NO SENTENCE TWICE/.test(SUMMARY_SYSTEM_PROMPT));
check(
  "overview never lists completed activities",
  /It never lists the\s+completed activities/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "scope and completed works are not the same list twice",
  /not the same list written twice/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "and completion is still never approval or certification",
  /Completion is never approval, acceptance, handover, inspection, testing/.test(SUMMARY_SYSTEM_PROMPT),
);

console.log("\n6. Progress text still flows into Completion, and covered days do not");

const progressReport = {
  number: 1,
  title: "Week one",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-04",
  sections: [
    {
      label: "Works completed",
      content:
        "The manhole was rebuilt using engineering bricks and mortar and C4 concrete was placed around the main hall.",
    },
    { label: "Issues and resolutions", content: "Cracked concrete and a loose cover were made good." },
    { label: "Next period", content: "Localised patch repairs are programmed at the second manhole on bay 39." },
  ],
};
const uncoveredDay = {
  number: 9,
  date: "2026-09-08",
  sections: [{ label: "Works completed", content: "Line marking was applied to bays 40 to 46." }],
  rawNotes: null,
  workforce: ["Groundworks Ltd: 4 operative(s)"],
  plant: [],
};

const built = buildEvidence({ progress: [progressReport], daily: [uncoveredDay] });
check("the Progress Report contributed", built.progressCount === 1);
check("its activities reach the context", built.text.includes("rebuilt using engineering bricks and mortar"));
check("its materials", built.text.includes("C4 concrete"));
check("its locations", built.text.includes("main hall"));
check("its issues and resolutions", built.text.includes("Cracked concrete and a loose cover were made good"));
check("its outstanding item", built.text.includes("Localised patch repairs are programmed"));
check("with its certainty intact", built.text.includes("are programmed"), "not 'were completed'");
check("the uncovered day fills its gap", built.text.includes("Line marking was applied to bays 40 to 46"));
check("with its quantities", built.text.includes("4 operative(s)"));
check("and it is counted separately", built.dailyCount === 1);

// A day the Progress Report covers is not in `daily` at all - the action filters
// it on via_summary_report_id - so its wording cannot appear a second time.
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
check(
  "the Progress Report's account appears exactly once",
  occurrences(built.text, "rebuilt using engineering bricks and mortar") === 1,
);
check(
  "covered days are excluded before the builder ever sees them",
  /\.filter\(\(source\) => source\.report_id && !source\.via_summary_report_id\)/.test(
    read("../app/(app)/summary-reports/ai-actions.ts"),
  ),
);
check(
  "and a detailed job is not collapsed to one line",
  built.characters > 300,
  String(built.characters),
);

console.log("\n7. Standalone Completion and the photo pipeline are untouched");

const actions = read("../app/(app)/summary-reports/actions.ts");
check(
  "a completion report may still be written directly",
  /a job can genuinely finish with nothing issued behind it|standalone/i.test(actions),
);
check(
  "a standalone report still drafts from its own sections",
  buildEvidence({ own: [{ label: "Project overview", content: "Written from what was sent through." }] })
    .characters > 0,
);
check(
  "and still claims no provenance",
  /THIS REPORT HAS NO SOURCE DAILY REPORTS/.test(read("../lib/summary-reports/provenance.ts")),
);
check(
  "the photograph selection is still reconciled, not rewritten",
  /\.update\(\{ caption_override: caption \}\)/.test(actions),
);
check(
  "the arranged order is still never written by the curation save",
  !/\.update\(\{[^}]*sort_order/.test(actions),
);
check(
  "and the plate list is still the report's own links",
  /const attachedPhotos: ReportPhoto\[\] = \(photoLinksResult\.data \?\? \[\]\)/.test(
    read("../app/(app)/summary-reports/[id]/page.tsx"),
  ),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL COMPLETION CONTENT CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
