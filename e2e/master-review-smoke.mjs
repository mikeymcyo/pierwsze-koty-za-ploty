/**
 * The whole-report review: what the editor is told, and what accepting one can
 * possibly change.
 *
 * Needs neither Supabase, a dev server, nor a key. Section AI writes one
 * section; this sits above it as a sub-editor, and the things worth protecting
 * are that it never invents a fact, never silently resolves a contradiction,
 * and never replaces a paragraph somebody wrote by hand without being asked.
 */
import { readFileSync } from "node:fs";

import { MASTER_REVIEW_SYSTEM_PROMPT, buildMasterReviewPrompt } from "../lib/ai/master-review-prompt.ts";
import {
  bulkAcceptableSections,
  changedSections,
  describeApplied,
  hasProposals,
  reconcileReview,
  sectionsToApply,
} from "../lib/reports/master-review.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. It is told to cut duplication and fix placement");
check(
  "duplication is named as the job",
  /The same fact stated in two sections is stated once/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and the summary-repeats-the-detail fault by name",
  /commonest fault/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "a misplaced fact moves rather than being copied",
  /moves to the right one/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "an unchanged section is a good outcome",
  /An unchanged\s+section is a good outcome/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "rewriting to show off is called out",
  /Do not rewrite\s+something merely to show that you read it/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n2. AI filler is named so it can be cut");
for (const phrase of ["it is important to note", "overall", "furthermore", "in conclusion"]) {
  check(`"${phrase}" is listed as filler`, MASTER_REVIEW_SYSTEM_PROMPT.toLowerCase().includes(phrase));
}
check("British English is required", /British English/.test(MASTER_REVIEW_SYSTEM_PROMPT));

console.log("\n3. It may never invent a construction fact");
for (const [what, pattern] of [
  ["completion or programme status", /completion or programme status/i],
  ["materials and quantities", /materials, products, specifications, quantities, dimensions/i],
  ["locations", /locations, levels, rooms, plots or elevations/i],
  ["dates", /dates, times or durations/i],
  ["people, trades, plant, deliveries", /people, trades, companies, plant or deliveries/i],
  ["defects, causes, responsibility", /defects, their causes, or who is responsible/i],
  ["approvals and certification", /approvals, inspections, tests, certification or compliance/i],
  ["health and safety outcomes", /health and safety events or outcomes/i],
  ["the absence of any of it", /the absence of any of the above/i],
]) {
  check(`${what} cannot be invented`, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}
check(
  "silence is still not evidence of absence",
  /Silence is not evidence of absence/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "no nil returns",
  /no issues were reported/i.test(MASTER_REVIEW_SYSTEM_PROMPT) &&
    /on programme/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "shortening is safer than lengthening",
  /Shortening a section is always safer than lengthening one/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n4. Contradictions are flagged, never resolved");
check(
  "the instruction is explicit",
  /FLAG, NEVER RESOLVE/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "it may not quietly drop one side",
  /must not choose\s+between them, quietly drop one/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "the decision belongs to the person who was there",
  /belongs to the\s+person who was on site/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
for (const [what, pattern] of [
  ["resolved vs outstanding", /resolved in one place and outstanding in another/i],
  ["complete vs ongoing", /complete and also as ongoing or outstanding/i],
  ["figures that disagree", /dates, quantities or figures that do not agree/i],
  ["photo caption vs prose", /photograph's status or caption disagreeing/i],
  ["document revision", /document's revision disagreeing/i],
]) {
  check(`it looks for ${what}`, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}

console.log("\n5. Gaps are raised, never filled");
check("the instruction is explicit", /GAPS - RAISE, NEVER FILL/.test(MASTER_REVIEW_SYSTEM_PROMPT));
for (const [what, pattern] of [
  ["an issue with no resolution", /issue with no recorded resolution/i],
  ["a delivery with no detail", /delivery mentioned with no supplier/i],
  ["an outstanding item with nobody against it", /outstanding item with nobody and no date/i],
  ["work with no photograph", /work described with no photograph selected/i],
  ["a thin section", /section that is thin next to the evidence/i],
]) {
  check(`it raises ${what}`, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}
check(
  "a warning changes nothing by itself",
  /It never changes the report by itself/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n6. Manual sections are treated carefully in the prompt too");
check(
  "the model is told which sections a person wrote",
  /WRITTEN BY: the site manager, by hand/.test(
    buildMasterReviewPrompt({
      documentKind: "DAILY SITE REPORT",
      projectName: "Lidl South Croydon",
      client: null,
      siteAddress: null,
      periodLabel: "5 January 2026",
      reportNumber: "001",
      sections: [
        { type: "executive_summary", label: "Summary", content: "Mine.", aiGenerated: false },
      ],
      evidence: [],
    }),
  ),
);
check(
  "and told to be conservative with them",
  /be conservative: change it\s+only for real duplication/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n7. The prompt carries the evidence, not the images or the PDFs");
const prompt = buildMasterReviewPrompt({
  documentKind: "COMPLETION REPORT",
  projectName: "Lidl South Croydon",
  client: "Lidl GB",
  siteAddress: "South Croydon",
  periodLabel: "the whole project",
  reportNumber: "002",
  sections: [
    { type: "project_overview", label: "Project overview", content: "External works.", aiGenerated: true },
  ],
  evidence: [
    { heading: "ISSUES PRESENTED IN THIS DOCUMENT", lines: ["Kerb damage · status Closed"] },
    { heading: "EMPTY BLOCK", lines: [] },
  ],
});
check("the project and client are named", prompt.includes("Lidl GB"));
check("a section arrives with its label", /project_overview \(Project overview\)/.test(prompt));
check("evidence with content appears", prompt.includes("Kerb damage"));
check("an empty evidence block is dropped rather than printed", !prompt.includes("EMPTY BLOCK"));

console.log("\n8. The reply is reconciled against the report, never trusted");
const current = [
  { sectionType: "executive_summary", label: "Summary", content: "The old summary.", aiGenerated: true },
  { sectionType: "works_completed", label: "Works completed", content: "Mine, by hand.", aiGenerated: false },
  { sectionType: "health_safety", label: "Health and safety", content: "Toolbox talk held.", aiGenerated: true },
];
const review = reconcileReview(
  current,
  [
    { sectionType: "executive_summary", proposedText: "A tighter summary.", reason: "repeated the detail" },
    { sectionType: "works_completed", proposedText: "Mine, by hand.", reason: "" },
    // A section the report does not have. Must be discarded.
    { sectionType: "invented_section", proposedText: "Something new entirely.", reason: "" },
    // health_safety omitted by the model entirely.
  ],
  [
    { type: "contradiction", severity: "high", message: "Issue 3 reads two ways.", relatedSection: "works_completed" },
    { type: "missing", severity: "medium", message: "A delivery has no reference.", relatedSection: "invented_section" },
    { type: "nonsense", severity: "urgent", message: "Odd one.", relatedSection: null },
    { type: "other", severity: "low", message: "   ", relatedSection: null },
  ],
  "Reads well apart from the summary.",
);

check("a section the report does not have is discarded", review.sections.length === 3);
check(
  "and cannot be smuggled in under any name",
  !review.sections.some((s) => s.sectionType === "invented_section"),
);
check("a section the model omitted is carried through unchanged",
  review.sections.find((s) => s.sectionType === "health_safety").changed === false);
check(
  "an omitted section keeps its text rather than being emptied",
  review.sections.find((s) => s.sectionType === "health_safety").originalText === "Toolbox talk held.",
);
check("a genuinely rewritten section is marked changed",
  review.sections.find((s) => s.sectionType === "executive_summary").changed === true);
check(
  "an identical rewrite is not marked changed, whatever the model claimed",
  review.sections.find((s) => s.sectionType === "works_completed").changed === false,
);
check("the manual section is flagged as manual",
  review.sections.find((s) => s.sectionType === "works_completed").wasManual === true);
check("order follows the report, not the reply",
  review.sections.map((s) => s.sectionType).join() === "executive_summary,works_completed,health_safety");
check("an unknown warning type falls back to other",
  review.warnings.find((w) => w.message === "Odd one.").type === "other");
check("an unknown severity falls back to medium",
  review.warnings.find((w) => w.message === "Odd one.").severity === "medium");
check("a warning pointing at a section nobody has keeps the warning, drops the pointer",
  review.warnings.find((w) => w.message.startsWith("A delivery")).relatedSection === null);
check("an empty warning is dropped", review.warnings.length === 3);
check("warnings never become sections", review.sections.every((s) => s.proposedText !== "Odd one."));

console.log("\n9. Accepting changes only what was accepted");
check("one changed section is on offer", changedSections(review).length === 1);
check("there is something to show", hasProposals(review));
const only = sectionsToApply(review, ["executive_summary"]);
check("accepting it returns exactly one write", only.length === 1);
check("with the proposed text", only[0].content === "A tighter summary.");
check(
  "accepting one section does not write another",
  !only.some((w) => w.sectionType === "works_completed" || w.sectionType === "health_safety"),
);
check("rejecting everything writes nothing", sectionsToApply(review, []).length === 0);
check(
  "ticking an unchanged section writes nothing",
  sectionsToApply(review, ["works_completed", "health_safety"]).length === 0,
);
check(
  "a section that was never in the review cannot be written",
  sectionsToApply(review, ["invented_section"]).length === 0,
);

console.log("\n10. Bulk accept never sweeps up hand-written sections");
const manualChanged = reconcileReview(
  [
    { sectionType: "executive_summary", label: "Summary", content: "AI wrote this.", aiGenerated: true },
    { sectionType: "works_completed", label: "Works completed", content: "I wrote this.", aiGenerated: false },
  ],
  [
    { sectionType: "executive_summary", proposedText: "Polished.", reason: "trimmed filler" },
    { sectionType: "works_completed", proposedText: "Polished mine too.", reason: "trimmed filler" },
  ],
  [],
  "",
);
check("both are genuinely changed", changedSections(manualChanged).length === 2);
check(
  "but bulk accept offers only the AI-drafted one",
  bulkAcceptableSections(manualChanged).join() === "executive_summary",
  bulkAcceptableSections(manualChanged).join(),
);
check(
  "the hand-written one is still acceptable individually",
  sectionsToApply(manualChanged, ["works_completed"]).length === 1,
);
check(
  "and applying the bulk selection leaves it alone",
  sectionsToApply(manualChanged, bulkAcceptableSections(manualChanged)).every(
    (w) => w.sectionType !== "works_completed",
  ),
);

console.log("\n11. An issued report cannot be reviewed or rewritten in place");
const actions = readFileSync(new URL("../app/(app)/reports/review-actions.ts", import.meta.url), "utf8");
check(
  "running a review refuses a final report",
  (actions.match(/status === "final"\) return \{ error: REVIEW_NEEDS_DRAFT \}/g) ?? []).length === 2,
);
check(
  "and so does applying one",
  /applyReview[\s\S]*status === "final"/.test(actions),
);
check(
  "the message says to reopen it",
  /Reopen it before running a review/i.test(
    readFileSync(new URL("../lib/reports/master-review.ts", import.meta.url), "utf8"),
  ),
);
check(
  "no update() the apply path makes ever writes ai_generated",
  (actions.match(/\.update\(\{[^}]*\}/g) ?? []).every((call) => !/ai_generated/.test(call)),
  (actions.match(/\.update\(\{[^}]*\}/g) ?? []).join(" | "),
);
check(
  "it writes content and a timestamp, nothing else",
  (actions.match(/\.update\(\{[^}]*\}/g) ?? []).length === 2 &&
    (actions.match(/\.update\(\{[^}]*\}/g) ?? []).every((call) =>
      /content: write\.content/.test(call),
    ),
);
check(
  "only sectionsToApply reaches the database",
  /const writes = sectionsToApply\(review, accepted\)/.test(actions),
);

console.log("\n12. Consolidated provenance is summarised, not fed twice");
const context = readFileSync(new URL("../lib/reports/review-context.ts", import.meta.url), "utf8");
check(
  "daily reports reached through a progress report are counted separately",
  /via_summary_report_id\)\.length/.test(context),
);
check(
  "and described as already counted",
  /already counted in them/.test(context),
);
check(
  "the source prose is not repeated",
  /the source prose is not repeated/i.test(context),
);
check(
  "photographs go in as status and caption, not pixels",
  /the images are not re-read/.test(context),
);
check(
  "documents go in as metadata, not contents",
  /contents are not parsed/.test(context),
);

console.log("\n13. What the user is told afterwards");
check("nothing applied says so", describeApplied(0) === "Nothing was changed.");
check("one reads in the singular", /^1 section updated/.test(describeApplied(1)));
check("several read in the plural", /^3 sections updated/.test(describeApplied(3)));
check("and it says the report stays editable", /still fully editable/.test(describeApplied(2)));


console.log("\n14. It plans the whole document before rewriting anything");
check("the planning step is named", /PLAN BEFORE YOU WRITE/.test(MASTER_REVIEW_SYSTEM_PROMPT));
check(
  "section-at-a-time rewriting is called out as the fault it is",
  /Do not work through the sections one at a time rewriting each in isolation/i.test(
    MASTER_REVIEW_SYSTEM_PROMPT,
  ),
);
for (const [step, pattern] of [
  ["list the supported facts", /List the facts the report and its evidence actually support/i],
  ["give each a primary home", /Decide which single section is the primary home/i],
  ["find duplicates", /Note where a fact appears in more than one section/i],
  ["find contradictions", /Note where two statements cannot both be true/i],
  ["find gaps", /Note what appears to be missing/i],
  ["only then write", /Only then decide what each section should say/i],
]) {
  check(`the plan says to ${step}`, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}
check("one fact, one home", /One fact, one home/.test(MASTER_REVIEW_SYSTEM_PROMPT));
check(
  "and no padding to match a neighbouring section",
  /no section needs padding to look as/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n15. Every section is given its own job");
for (const [role, pattern] of [
  ["the Daily Summary is the day's one account", /this is the main section and may carry the whole day by itself/i],
  ["Works completed adds particulars or nothing", /KEEP THE SUMMARY AND RETURN WORKS COMPLETED EMPTY/],
  ["and an empty one is a good outcome", /An\s+empty Works completed on a daily report is a good outcome, not a gap/i],
  ["deliveries and plant stay put", /Deliveries and plant: the logistical and equipment facts/i],
  ["planned works are never invented", /Never invent future works/i],
  ["scope is not chronology", /Scope of works: which workstreams and items were included\. Not chronology/i],
  ["stages are not the scope again", /Not the scope again/i],
  ["overview is context and outcome", /why the project or work package existed/i],
  ["outstanding means evidenced", /only items actually evidenced as/i],
]) {
  check(role, pattern.test(MASTER_REVIEW_SYSTEM_PROMPT));
}
check(
  "health and safety may not claim a quiet day",
  /no incidents occurred/i.test(MASTER_REVIEW_SYSTEM_PROMPT) &&
    /all works were carried out safely/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "sign-off may not claim completion or acceptance unsupported",
  /must not claim\s+completion, acceptance, handover, testing, commissioning, certification or\s+compliance/i.test(
    MASTER_REVIEW_SYSTEM_PROMPT,
  ),
);
check(
  "the commonest fault is shown worked through",
  /WORKED EXAMPLE OF THE COMMONEST FAULT/.test(MASTER_REVIEW_SYSTEM_PROMPT) &&
    /Loose Lidl sign fixings were attended to/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and the example makes clear no fact was added",
  /No fact was added, and nothing is now said twice/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n16. Malformed model output fails safely");
const junk = reconcileReview(
  [{ sectionType: "executive_summary", label: "Summary", content: "Original text.", aiGenerated: true }],
  [
    { sectionType: "executive_summary", proposedText: undefined, reason: undefined },
    { sectionType: "", proposedText: "orphan", reason: null },
  ],
  [{ type: undefined, severity: undefined, message: "still useful", relatedSection: undefined }],
  undefined,
);
check("a missing proposedText leaves the section untouched", junk.sections[0].changed === false);
check("and keeps the original text", junk.sections[0].originalText === "Original text.");
check("an entry with no section type cannot create one", junk.sections.length === 1);
check("a warning with no type still lands as other", junk.warnings[0].type === "other");
check("a missing assessment becomes an empty string, not undefined", junk.assessment === "");
check("nothing malformed becomes a write", sectionsToApply(junk, ["executive_summary", ""]).length === 0);

console.log("\n17. The context is read per report and left to RLS for isolation");
const contextSource = readFileSync(new URL("../lib/reports/review-context.ts", import.meta.url), "utf8");
check(
  "every read is scoped to the one report",
  (contextSource.match(/\.eq\("(report_id|summary_report_id|id)"/g) ?? []).length >= 6,
);
check(
  "no service-role or admin client is used to bypass policies",
  !/service_role|SERVICE_ROLE|createAdminClient/.test(contextSource),
);
check(
  "the project reference reaches the reviewer",
  /project_reference/.test(contextSource),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL MASTER REVIEW CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
