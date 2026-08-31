/**
 * What a Daily Report actually says.
 *
 * Four faults a tester found in issued dailies, and the rules that answer them:
 * the same day told twice under two headings, procurement counted as completed
 * work, a review that demanded a supplier and a target date for an ordinary
 * day's notes, and a document calling itself a Progress Report.
 *
 * Daily only. The consolidated documents are read in a dispute weeks later and
 * keep the stricter bar, which is checked here too so that loosening the daily
 * cannot quietly loosen them.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:daily-output
 */

import { readFileSync } from "node:fs";

import { CLEANUP_SECTIONS, CLEANUP_SYSTEM_PROMPT_TAIL } from "../lib/ai/cleanup-prompt.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { REPORT_SECTIONS } from "../lib/report-sections.ts";
import { reportStructure } from "../lib/report-structure.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const briefOf = (sections, type) => sections.find((section) => section.type === type)?.brief ?? "";
const dailyBrief = (type) => briefOf(REPORT_SECTIONS, type);
const cleanupBrief = (type) => briefOf(CLEANUP_SECTIONS.daily, type);

console.log("\n1. One strong Daily Summary, not the day told twice");

for (const [where, summary, completed] of [
  ["drafting", dailyBrief("executive_summary"), dailyBrief("works_completed")],
  ["cleanup", cleanupBrief("executive_summary"), cleanupBrief("works_completed")],
]) {
  check(`${where}: the summary is the day's one account`, /one account of the day/i.test(summary), summary);
  check(
    `${where}: and may carry the day on its own`,
    /carries the day on its own|carries the day/i.test(summary),
    summary,
  );
  check(
    `${where}: works completed adds only what the summary has not said`,
    /does not already carry/i.test(completed),
    completed,
  );
  check(
    `${where}: and is left empty when there is nothing to add`,
    /LEAVE THIS EMPTY/.test(completed),
    completed,
  );
  check(`${where}: the two briefs are not the same instruction`, summary !== completed);
}

check(
  "the reviewer is told which one to keep",
  /KEEP THE SUMMARY AND RETURN WORKS COMPLETED EMPTY/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and that an empty Works completed is not a gap to fill",
  /good outcome, not a gap/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "the worked example ends on the daily rule rather than on inventing detail",
  /not to invent detail to justify the second/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n2. Looking for something is not doing it");

const procurement = /sourc\w+|searching for|pricing|chas\w+|order\w+|await\w+/i;
check(
  "cleanup says procurement is never completed work",
  /Looking for something is not doing it/.test(CLEANUP_SYSTEM_PROMPT_TAIL),
);
check(
  "with the case that caused it",
  /trying to find the right sealant/.test(CLEANUP_SYSTEM_PROMPT_TAIL),
);
check(
  "and says where it goes instead",
  /is an outstanding item/.test(CLEANUP_SYSTEM_PROMPT_TAIL),
);
check(
  "ordering being done is not the works being done",
  /ordering was done, never the works/.test(CLEANUP_SYSTEM_PROMPT_TAIL),
);
check("the reviewer is told the same", /Looking for something is not doing it/.test(MASTER_REVIEW_SYSTEM_PROMPT));
check(
  "and told to move it rather than leave it under completed work",
  /Move it if you find it under\s+completed work/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check("the drafting brief for works completed says it too", procurement.test(dailyBrief("works_completed")));
check("and outstanding items claims it", procurement.test(dailyBrief("outstanding_items")));
check("in the cleanup brief as well", procurement.test(cleanupBrief("outstanding_items")));

// The status ladder is unchanged: this adds a case, it does not blur the rungs.
check(
  "future work is still never completed work",
  /Work described in the future NEVER appears as work completed/.test(CLEANUP_SYSTEM_PROMPT_TAIL),
);
check(
  "part-done work still belongs in works in progress",
  /Part-done work belongs in works in progress/.test(cleanupBrief("works_completed")),
);
check(
  "and completion is still only claimed where the notes claim it",
  /State completion only where the notes state it/.test(dailyBrief("works_completed")),
);

console.log("\n3. A proportionate review of one day");

check(
  "the reviewer is told to be proportionate to the document",
  /BE PROPORTIONATE TO THE DOCUMENT/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and why a needless warning costs something",
  /skim past the next warning/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

const daily = MASTER_REVIEW_SYSTEM_PROMPT.slice(
  MASTER_REVIEW_SYSTEM_PROMPT.indexOf("On a DAILY report"),
  MASTER_REVIEW_SYSTEM_PROMPT.indexOf("On a PROGRESS, COMPLETION or SURVEY report"),
);
check("a daily raises contradictions", /a contradiction between two parts/.test(daily));
check("and anything safety-critical", /safety-critical/.test(daily));
check("and serious gaps a reader would notice", /a serious gap a reader would notice/.test(daily));
check(
  "but is told not to demand a supplier",
  /do NOT ask for a supplier/.test(daily),
  daily,
);
check("nor a responsible person", /responsible person/.test(daily));
check("nor a target date", /target date/.test(daily));
check(
  "because ordinary site notes do not carry them",
  /Ordinary site notes do not carry them/.test(daily),
);
check("and no warning at all is a valid review", /No\s+warning at all is a valid review/.test(MASTER_REVIEW_SYSTEM_PROMPT));

// The looser bar is the daily's alone.
const consolidated = MASTER_REVIEW_SYSTEM_PROMPT.slice(
  MASTER_REVIEW_SYSTEM_PROMPT.indexOf("On a PROGRESS, COMPLETION or SURVEY report"),
);
check(
  "a consolidated report still wants a supplier on a bare delivery",
  /a delivery mentioned with no supplier, reference or detail/.test(consolidated),
);
check(
  "and still wants somebody against an outstanding item",
  /an outstanding item with nobody and no date against it/.test(consolidated),
);
check(
  "and still wants a resolution on a completion report",
  /especially on a completion report/.test(consolidated),
);

// Nothing here weakened the safeguards the reviewer already had.
check(
  "contradictions are still flagged and never resolved",
  /CONTRADICTIONS - FLAG, NEVER RESOLVE/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "gaps are still raised and never filled",
  /GAPS - RAISE, NEVER FILL/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "no fact may still be introduced",
  /Never introduce a fact that is not already in the report/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and silence is still not evidence of absence",
  /Silence is not evidence of absence/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "health and safety is still never a nil return",
  /Never\s+write "no incidents occurred"/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

console.log("\n3b. A photograph needs no caption");

check(
  "an uncaptioned photograph is stated to be valid evidence",
  /A PHOTOGRAPH NEEDS NO CAPTION/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and never a gap",
  /is valid evidence and\s+is never a gap/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "the reviewer is told captions are optional",
  /captions and statuses are\s+optional/i.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and told outright not to warn about a missing one",
  /Never warn that a caption,\s+a status, a description or a label is missing/.test(
    MASTER_REVIEW_SYSTEM_PROMPT,
  ),
);
check("nor to ask for one", /and never\s+ask for one/.test(MASTER_REVIEW_SYSTEM_PROMPT));

// What is still worth saying about a photograph: a real contradiction, or no
// photographs at all behind substantial work.
check(
  "a caption that contradicts the prose is still a warning",
  /CONTRADICTS the prose/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "and so is substantial work with no photographs at all",
  /no photographs at all/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);
check(
  "the contradiction list still names a disagreeing caption",
  /a photograph's status or caption disagreeing with the prose/.test(MASTER_REVIEW_SYSTEM_PROMPT),
);

// And the evidence the reviewer is handed no longer frames a plain photograph
// as one missing something.
const context = read("../lib/reports/review-context.ts");
check(
  "a plain photograph is listed as included evidence",
  /"a photograph included as evidence"/.test(context),
  context.match(/photoPrintLabelText\(photo\) \?\? "[^"]*"/)?.[0] ?? "",
);
check(
  "not as one with something missing",
  !/no status or caption recorded/.test(context),
);
check(
  "and the images themselves are still not re-read",
  /the images are not re-read/.test(context),
);

console.log("\n4. The document says what it is");

const document = read("../lib/pdf/report-document.tsx");
check('the daily prints "Site Daily Report"', /const documentType = "Site Daily Report"/.test(document));
check(
  "and no longer calls itself a Progress Report",
  !/documentType = "Site Progress Report"/.test(document),
);
check(
  "which is a different document in this system",
  /progress: "Progress Report"/.test(read("../lib/summary-reports/sections.ts")),
);

console.log("\n5. A heading with nothing under it is not printed");

check(
  "the PDF drops an empty group",
  /if \(entries\.length === 0 && photos\.length === 0 && issues\.length === 0\) return null;/.test(document),
);

const page = read("../app/(app)/reports/[id]/page.tsx");
check("and an issued report's screen now agrees with it", /showsWhenIssued/.test(page));
check(
  "Issues / Next Steps goes when there is no prose and no issue",
  /isFinal && !showsWhenIssued\("outstanding"\)/.test(page),
);
check("the same for the day's work", /isFinal && !showsWhenIssued\("summary"\)/.test(page));
check("and for the evidence", /isFinal && !showsWhenIssued\("evidence"\)/.test(page));
check(
  "an empty section counts as empty, not as present",
  /some\(\(section\) => section\.content\?\.trim\(\)\)/.test(page),
);
check(
  "but a draft keeps every heading, because they carry the controls",
  /A draft keeps all three/.test(page),
);

console.log("\n6. Daily only");

// The visible structure is untouched: no section type was removed, merged or
// renamed by any of this.
const structure = reportStructure("daily");
check("a daily still has three groups", structure.length === 3);
check(
  "with all eight stored sections still homed",
  structure.flatMap((group) => group.sections).length === 8,
);
check("the summary group is still called Daily Summary", structure[0].label === "Daily Summary");
check("and the third is still Issues / Next Steps", structure[2].label === "Issues / Next Steps");

for (const kind of ["progress", "completion", "survey"]) {
  const other = reportStructure(kind);
  check(`${kind} is untouched`, other.length === 3 && other[0].sections.length > 0);
}
check(
  "the progress period summary brief is unchanged",
  /AT MOST THREE concise sentences/.test(briefOf(CLEANUP_SECTIONS.progress, "period_summary")),
);
check(
  "and a progress works completed is not told to empty itself",
  !/LEAVE THIS EMPTY/.test(briefOf(CLEANUP_SECTIONS.progress, "works_completed")),
);

console.log("\n7. Nothing upstream or downstream moved");

const captureActions = read("../app/(app)/reports/capture-actions.ts");
check("Site Capture still appends raw notes verbatim", /appendCapture\(current\.raw_notes/.test(captureActions));
check("and still writes no section", !/report_sections/.test(captureActions));

const aiActions = read("../app/(app)/reports/ai-actions.ts");
check("cleanup still runs before drafting", aiActions.indexOf("cleanedSectionsFor") < aiActions.indexOf("generateSections"));
check("raw notes are still never overwritten by drafting", !/raw_notes:/.test(aiActions));
check("hand-written sections are still partitioned out", /partitionDraft/.test(aiActions));

const reviewActions = read("../app/(app)/reports/review-actions.ts");
check("the Master Review is still its own layer", /masterReview|reviewReport/i.test(reviewActions));
check(
  "and an issued report still takes no review",
  /REVIEW_NEEDS_DRAFT/.test(reviewActions),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL DAILY OUTPUT CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
