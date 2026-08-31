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
  outstandingMentions,
  repeatedSentences,
} from "../lib/summary-reports/completion-claims.ts";
import { COMPLETION_SECTIONS } from "../lib/summary-reports/sections.ts";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../lib/ai/summary-prompt.ts";
import { buildEvidence } from "../lib/summary-reports/evidence.ts";

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

console.log("\n4. The four sections have distinct jobs");

for (const [where, brief] of [["drafting", drafting("project_overview")], ["cleanup", cleanup("project_overview")]]) {
  check(`${where}: the overview is the story, not a list`, /story of the job/i.test(brief), brief);
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
for (const [where, brief] of [["drafting", drafting("scope_of_works")], ["cleanup", cleanup("scope_of_works")]]) {
  check(`${where}: scope asks for real technical depth`, /elements, locations, materials and systems/i.test(brief), brief);
  check(`${where}: a generic line is called a failure`, /generic line/i.test(brief), brief);
  check(`${where}: and it is not completed works again`, /completed works/i.test(brief), brief);
}
for (const [where, brief] of [["drafting", drafting("completed_works")], ["cleanup", cleanup("completed_works")]]) {
  check(`${where}: completed works are specific activities`, /specific activities/i.test(brief), brief);
  check(
    `${where}: planned and awaited work is excluded`,
    /planned, programmed, awaited or still to be carried out/i.test(brief),
    brief,
  );
  check(
    `${where}: and a blanket sentence is refused outright`,
    /all works were completed successfully/i.test(brief) && /does not belong in this section/i.test(brief),
    brief,
  );
}
const signOff = drafting("sign_off");
check("outstanding work comes before sign-off", /Two things, in this order/.test(signOff));
check(
  "and sign-off is only ever what a record says",
  /Never write that the works were accepted, handed over, approved, tested, commissioned, certified or signed off/.test(
    signOff,
  ),
);
check(
  "the four briefs are all different",
  new Set([drafting("project_overview"), drafting("scope_of_works"), drafting("completed_works"), signOff]).size === 4,
);

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
