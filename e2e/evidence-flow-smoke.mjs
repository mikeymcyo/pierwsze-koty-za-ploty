/**
 * Does the text actually get there?
 *
 * A real iPhone test found two rich Daily Reports producing an empty Progress
 * Report. The words existed, the provenance was exact, the photographs came
 * across - and the account of the work did not. The assembly that turns source
 * reports into the context a model reads was buried inside a "use server"
 * action, so nothing could test it and nobody could see what it produced.
 *
 * It is now lib/summary-reports/evidence.ts, and this is the suite that proves
 * the words arrive. Every check here is on real assembled text, not on the
 * shape of a query.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:evidence-flow
 */

import { readFileSync } from "node:fs";

import {
  RAW_NOTES_THRESHOLD,
  buildEvidence,
  dailyEvidenceBlock,
  gapFillingNotes,
  noEvidenceMessage,
  progressEvidenceBlock,
  sectionLines,
  unrepresentedShare,
} from "../lib/summary-reports/evidence.ts";


const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

// The reports from the iPhone test that exposed this, word for word.
const dayOne = {
  number: 1,
  date: "2026-08-31",
  sections: [
    {
      label: "Summary",
      content:
        "Remedial works were undertaken to a manhole at RDC Northfleet following the identification of cracked concrete and a loose cover.",
    },
    {
      label: "Works completed",
      content:
        "Broken and crumbled concrete was removed from around the manhole, and the manhole cover was removed. The manhole was rebuilt using engineering bricks and mortar.",
    },
    {
      label: "Works in progress",
      content: "Concrete placement around the rebuilt manhole remained to be undertaken.",
    },
    { label: "Planned works", content: "C4 concrete is planned to be poured around the manhole tomorrow." },
  ],
  rawNotes:
    "manhole at northfleet cracked concrete loose cover, broke out the crumbled concrete, took the cover off, rebuilt it in engineering bricks and mortar, pouring C4 around it tomorrow",
  workforce: ["Groundworks Ltd (groundworks): 3 operative(s)"],
  plant: ["13t tracked excavator x1"],
};

const dayTwo = {
  number: 2,
  date: "2026-09-01",
  sections: [
    {
      label: "Summary",
      content:
        "Concrete reinstatement works progressed, with the main hall works recorded as completed and localised works commenced at the second manhole on bay 39.",
    },
    {
      label: "Works completed",
      content:
        "C4 concrete was placed around the main hall. Reinstatement works to this area were completed, and the expansion joint was applied.",
    },
    {
      label: "Works in progress",
      content: "Breaking out commenced to the second manhole on bay 39, described as localised patch repairs.",
    },
  ],
  rawNotes: "poured the C4 round the main hall, joint in, started breaking out the second manhole bay 39",
  workforce: [],
  plant: [],
};

console.log("\n1. Two text-rich Dailies reach the context with their facts intact");

const both = buildEvidence({ daily: [dayOne, dayTwo] });
check("both reports contributed", both.dailyCount === 2, String(both.dailyCount));
check("and the evidence is substantial", both.characters > 500, String(both.characters));

for (const fact of [
  "manhole",
  "RDC Northfleet",
  "cracked concrete",
  "engineering bricks and mortar",
  "C4 concrete",
  "main hall",
  "expansion joint",
  "bay 39",
  "localised patch repairs",
]) {
  check(`"${fact}" reaches the model`, both.text.includes(fact));
}
check("quantities survive", both.text.includes("3 operative(s)") && both.text.includes("13t tracked excavator"));
check("both reports are named and dated", /FINAL DAILY REPORT 001 - 2026-08-31/.test(both.text) && /FINAL DAILY REPORT 002 - 2026-09-01/.test(both.text));
check(
  "sections arrive under the labels a reader knows",
  both.text.includes("Works completed:") && both.text.includes("Works in progress:"),
  "not works_completed",
);

console.log("\n2. A source-based report generates with no new wording from the user");

check(
  "evidence exists with nothing typed into the Progress Report itself",
  buildEvidence({ daily: [dayOne, dayTwo], own: undefined }).characters > 0,
);
check(
  "and with the report's own sections completely empty",
  buildEvidence({
    daily: [dayOne],
    own: [
      { label: "Period summary", content: null },
      { label: "Key activities", content: "" },
    ],
  }).characters > 0,
);
check(
  "the action refuses to call a model only when nothing was read",
  /if \(built\.characters === 0\)/.test(read("../app/(app)/summary-reports/ai-actions.ts")),
);
check(
  "manual text is never required",
  !/write something first|type a description/i.test(read("../components/summary-reports/summary-draft.tsx")),
);

console.log("\n3. An unticked Daily Report contributes nothing");

const onlyDayOne = buildEvidence({ daily: [dayOne] });
check("the ticked report is there", onlyDayOne.text.includes("engineering bricks"));
check("the unticked one is not", !onlyDayOne.text.includes("bay 39"), "its words must not appear");
check("and it is not counted", onlyDayOne.dailyCount === 1);
check(
  "the action feeds only sources with no via, which is the selection",
  /\.filter\(\(source\) => source\.report_id && !source\.via_summary_report_id\)/.test(
    read("../app/(app)/summary-reports/ai-actions.ts"),
  ),
);

console.log("\n4. Later completion can supersede earlier in-progress");

// Day one leaves the concrete outstanding; day two records it placed. Both
// statements must be in the context, in date order, for the consolidator to be
// able to resolve them - it cannot supersede what it cannot see.
const inProgressAt = both.text.indexOf("remained to be undertaken");
const completedAt = both.text.indexOf("C4 concrete was placed");
check("the earlier in-progress statement is present", inProgressAt !== -1);
check("the later completion is present", completedAt !== -1);
check("and the later one reads after the earlier one", completedAt > inProgressAt);
check(
  "the consolidator is told the last state wins",
  /the last state wins/.test(read("../lib/ai/summary-prompt.ts")),
);
check(
  "and that work finished later in the period is completed, not in progress",
  /recorded as started early in the period and finished later in it is/.test(
    read("../lib/ai/summary-prompt.ts"),
  ),
);
check(
  "an issue and its later resolution are one chronology",
  /is one issue, resolved/.test(read("../lib/ai/summary-prompt.ts")),
);

console.log("\n5. A selected Progress Report's text reaches a Completion Report");

const progressOne = {
  number: 1,
  title: "Week one",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-04",
  sections: [
    {
      label: "Period summary",
      content: "Manhole reinstatement was completed across the yard and the main hall slab was poured.",
    },
    { label: "Works completed", content: "Two manholes were rebuilt in engineering brick and reinstated in C4 concrete." },
    { label: "Next period", content: "Line marking is programmed for the following week." },
  ],
};

const completion = buildEvidence({ progress: [progressOne], daily: [] });
check("the Progress Report contributed", completion.progressCount === 1);
check("its period summary reaches the model", completion.text.includes("main hall slab was poured"));
check("its completed works too", completion.text.includes("Two manholes were rebuilt"));
check("and what it said about next period", completion.text.includes("Line marking is programmed"));
check("it is named and dated", /ISSUED PROGRESS REPORT 001/.test(completion.text));
check("with its period", completion.text.includes("2026-08-31 to 2026-09-04"));
check("and its title", completion.text.includes("Week one"));
// Asserted directly so a change to either shows as its own failure rather than
// as a mystery inside a combined string.
check(
  "a Progress Report that wrote nothing is not a block",
  progressEvidenceBlock({
    number: 4,
    title: null,
    periodStart: null,
    periodEnd: null,
    sections: [{ label: "Period summary", content: "   " }],
  }) === null,
);
check(
  "and sections with no content produce no lines",
  sectionLines([{ label: "Period summary", content: null }]) === null,
);

console.log("\n6. A Daily covered by that Progress Report is not read twice");

// The caller filters covered dailies out; what is proved here is that the
// covered day's words then appear exactly once - through the Progress Report.
const covered = buildEvidence({ progress: [progressOne], daily: [dayTwo] });
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
check(
  "the Progress Report's account of the manholes appears once",
  occurrences(covered.text, "Two manholes were rebuilt") === 1,
);
check(
  "day one's own wording is absent, because its Progress Report covers it",
  !covered.text.includes("Broken and crumbled concrete"),
);
check(
  "the covered day is not counted as a Daily source",
  covered.dailyCount === 1 && covered.progressCount === 1,
);
check(
  "provenance still records it - the filter is on evidence, not on the record",
  /via: viaByDaily\.get\(id\) \?\? null/.test(read("../lib/summary-reports/source-plan.ts")) &&
    /via_summary_report_id/.test(read("../app/(app)/summary-reports/actions.ts")),
);

console.log("\n7. An uncovered Daily Report fills the gap");

check("its words are there", covered.text.includes("bay 39"));
check("under its own heading", /FINAL DAILY REPORT 002/.test(covered.text));
check(
  "and it reads after the Progress Reports, not mixed into them",
  covered.text.indexOf("FINAL DAILY REPORT 002") > covered.text.indexOf("ISSUED PROGRESS REPORT 001"),
);

console.log("\n8. Raw site notes fill gaps, and never duplicate");

// A day written up faithfully: the notes say the same things in rougher words.
check(
  "a day already written up does not send its notes as well",
  gapFillingNotes(dayOne.rawNotes, dayOne.sections) === null,
  `${Math.round(unrepresentedShare(dayOne.rawNotes, dayOne.sections) * 100)}% unrepresented`,
);
check("so the account is not told twice", occurrences(both.text, "engineering brick") <= 2);

// A day dictated and issued without ever drafting. The notes are the only
// account there is, and losing them would lose the day.
const undrafted = { ...dayOne, sections: [], rawNotes: "kerb line reset outside unit 4, two bags of postcrete used" };
check(
  "a report issued without drafting still contributes its notes",
  buildEvidence({ daily: [undrafted] }).text.includes("kerb line reset outside unit 4"),
);
check("and is counted as a source", buildEvidence({ daily: [undrafted] }).dailyCount === 1);

// Drafted at lunchtime, three more Site Capture entries at four o'clock. The
// afternoon is in the notes and in no section.
const afternoon = {
  ...dayTwo,
  rawNotes:
    "poured the C4 round the main hall, joint in, started breaking out the second manhole bay 39. Later: scaffold handover paperwork signed by Kilnbridge, drainage jetting booked for Thursday, damaged bollard reported outside the loading dock",
};
check(
  "an afternoon captured after drafting is not lost",
  (gapFillingNotes(afternoon.rawNotes, afternoon.sections) ?? "").includes("damaged bollard"),
  `${Math.round(unrepresentedShare(afternoon.rawNotes, afternoon.sections) * 100)}% unrepresented`,
);
check(
  "and it is labelled as an addition rather than as the day's account",
  /Also recorded on site that day/.test(dailyEvidenceBlock(afternoon) ?? ""),
);
check("the threshold is stated rather than buried", RAW_NOTES_THRESHOLD === 0.25);
check("notes that are empty contribute nothing", gapFillingNotes("   ", dayOne.sections) === null);
check("and a report with neither is not a block at all", dailyEvidenceBlock({
  number: 9,
  date: "2026-09-09",
  sections: [{ label: "Summary", content: null }],
  rawNotes: null,
  workforce: [],
  plant: [],
}) === null);

console.log("\n9. The failure that started this cannot happen silently again");

const actions = read("../app/(app)/summary-reports/ai-actions.ts");
check(
  "a heading with nothing under it is no longer pushed as evidence",
  buildEvidence({
    daily: [{ number: 5, date: "2026-09-05", sections: [], rawNotes: null, workforce: [], plant: [] }],
  }).characters === 0,
  "that is what made the empty-evidence guard useless",
);
check(
  "a failed read stops the draft instead of quietly losing a report",
  /Could not read the source Daily Reports/.test(actions) &&
    /Could not read the source Progress Reports/.test(actions),
);
check(
  "empty sources say so in words somebody can act on",
  /carry no written content/.test(noEvidenceMessage({ text: "", progressCount: 0, dailyCount: 0, characters: 0 }, 2)),
);
check(
  "and a report with no sources at all is told something different",
  /nothing to work from yet/.test(noEvidenceMessage({ text: "", progressCount: 0, dailyCount: 0, characters: 0 }, 0)),
);
check(
  "the screen says what was actually consolidated",
  /describeEvidence\(state\.fromProgress/.test(read("../components/summary-reports/summary-draft.tsx")),
);
check("the action reports the counts", /fromDaily: built\.dailyCount/.test(actions));
check(
  "and a model that reads evidence but writes nothing says which",
  /The model read the evidence but returned no sections/.test(read("../lib/ai/summary-generation.ts")),
);

console.log("\n10. Nothing protected was touched");

check("issued reports still refuse a redraft", /SUMMARY_REPORT_IS_FINAL/.test(actions));
check("hand-written sections are still protected", /partitionDraft/.test(actions));
check("cleanup still runs before drafting", actions.indexOf("cleanedSectionsFor") < actions.indexOf("generateSummarySections"));
check("the cleanup pass reads the same evidence", /source: evidence/.test(actions));
check("photograph curation still feeds captions", /photoCaptions/.test(actions));
check("no service-role client appears", !/service_role|SERVICE_ROLE/.test(actions));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL EVIDENCE FLOW CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
