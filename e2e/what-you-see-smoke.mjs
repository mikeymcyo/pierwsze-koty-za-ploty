/**
 * What you see before export is what you get in the PDF.
 *
 * One rule, applied to Daily, Progress and Completion alike: if text can reach
 * the exported document, it is plainly visible on the screen the person signs
 * off. No collapsible narrative, no "Also in this section", no prose behind an
 * arrow, and no second section telling the same story in different words.
 *
 * The fault this exists to stop: a Daily Report drafted four sections, showed
 * one and folded three, and exported all four. Somebody signed off a document
 * they had read a quarter of.
 *
 *   npm run test:what-you-see
 */

import { readFileSync } from "node:fs";

import { groupSections, reportStructure } from "../lib/report-structure.ts";
import { DAILY_DRAFTED_TYPES, REPORT_SECTIONS } from "../lib/report-sections.ts";
import {
  COMPLETION_DRAFTED_TYPES,
  COMPLETION_SECTIONS,
  PROGRESS_DRAFTED_TYPES,
  PROGRESS_SECTIONS,
  summaryDraftedSectionsFor,
} from "../lib/summary-reports/sections.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
/** Source with its comments removed: what the code does, not what it says. */
const code = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const dailyPage = read("../app/(app)/reports/[id]/page.tsx");
const summaryPage = read("../app/(app)/summary-reports/[id]/page.tsx");
const dailyPdf = read("../lib/pdf/report-document.tsx");
const summaryPdf = read("../lib/pdf/summary-document.tsx");
const groupEditor = read("../components/reports/group-editor.tsx");
const captureForm = read("../components/reports/report-capture-form.tsx");
const sectionCard = read("../components/reports/report-section-card.tsx");

console.log("\n1. The screen and the document group prose the same way");

// Both sides call groupSections with the report's own kind, so the sections
// that print are by construction the sections that show. That is the property
// the rest of this file protects.
check("the daily screen groups its sections", /groupSections\(/.test(dailyPage));
check("and so does the daily PDF", /groupSections\(/.test(dailyPdf));
check("the consolidated screen groups its sections", /groupSections\(/.test(summaryPage));
check("and so does the consolidated PDF", /groupSections\(/.test(summaryPdf));

for (const kind of ["daily", "progress", "completion", "survey"]) {
  const stored = [
    ...REPORT_SECTIONS.map((s) => s.type),
    ...PROGRESS_SECTIONS.map((s) => s.type),
    ...COMPLETION_SECTIONS.map((s) => s.type),
  ].map((type) => ({ type, label: type, content: `${type} content.` }));

  const grouped = groupSections(kind, stored);
  const printed = grouped.flatMap((entry) => entry.entries.map((e) => e.type));
  const declared = reportStructure(kind).flatMap((group) => group.sections);

  check(
    `${kind}: exactly the declared sections come through, in order`,
    printed.join(",") === declared.filter((type) => printed.includes(type)).join(","),
    printed.join(","),
  );
  check(
    `${kind}: nothing outside the structure is carried into the document`,
    printed.every((type) => declared.includes(type)),
    printed.filter((type) => !declared.includes(type)).join(",") || "none",
  );
}

console.log("\n2. Nothing that exports is behind a disclosure");

check("the fold inside the editor is gone", !/<details/.test(code(groupEditor)));
check("and so is the phrase that named it", !/Also in this section/.test(code(groupEditor)));
check(
  "the component that put the editor away is gone",
  !/export function EditDisclosure/.test(sectionCard),
);
check("and neither screen uses it", !/EditDisclosure/.test(dailyPage) && !/EditDisclosure/.test(summaryPage));

// Recorded data - workforce, plant, the document register, the source record -
// is printed in the issued PDF's appendix, so it is inline on the screen too.
// It was behind "Advanced details" until it turned out a report could export a
// workforce nobody had opened the panel to look at.
check(
  "the disclosure that held recorded data is gone from the card",
  // A fold is offered only for records that hold nothing yet - an empty
  // document register is a control, not content - and the page may ask for
  // it only when no document is linked.
  /records\?: React\.ReactNode/.test(sectionCard) &&
    /records && recordsFolded \? \(/.test(code(sectionCard)) &&
    /recordsFolded=\{!isFinal && referencedDocuments\.length === 0\}/.test(dailyPage) &&
    !/recordsFolded/.test(summaryPage),
);
check(
  "and its label with it",
  // The code, not the comments that record why it went.
  !/ADVANCED_DETAILS_LABEL|Advanced details/.test(
    code(read("../lib/report-structure.ts")) + code(dailyPage) + code(summaryPage),
  ),
);
// The date, weather, workforce and plant fold on the Daily screen now - it
// is a screen for speaking into, not a form - but every value that will
// print is on the line of the fold, so nothing exports unseen.
check(
  "the date, weather, workforce and plant are on the form, with what prints on the fold",
  ["WorkforceRows", "PlantRows", "report_date", "weather"].every((kept) =>
    captureForm.includes(kept),
  ) &&
    /const detailsLine = summariseDetails\(/.test(captureForm) &&
    /<summary[\s\S]*?\{detailsLine\}/.test(captureForm),
);
{
  const { summariseDetails, NOTHING_RECORDED } = await import("../lib/reports/details-summary.ts");
  const fmt = (value) => `D:${value}`;
  check(
    "the fold's line carries every workforce and plant row",
    summariseDetails(
      { reportDate: "2026-09-12", weather: "Dry", workforce: [{ company_name: "Groundworks Ltd", operatives: 4 }], plant: [{ description: "13t excavator", quantity: 1 }] },
      fmt,
    ) === "D:2026-09-12 · Dry · Groundworks Ltd ×4 · 13t excavator ×1",
  );
  check(
    "and says so when there is nothing recorded",
    summariseDetails({ reportDate: null, weather: null, workforce: [], plant: [] }, fmt) === NOTHING_RECORDED,
  );
  check(
    "a blank row is not a row",
    summariseDetails({ reportDate: "2026-09-12", weather: "", workforce: [{ company_name: "  ", operatives: 0 }], plant: [] }, fmt) === `D:2026-09-12 · ${NOTHING_RECORDED}`,
  );
}
check(
  "supporting documents sit inline under their own heading",
  /recordsLabel="Supporting documents"/.test(dailyPage) &&
    /recordsLabel="Supporting documents"/.test(summaryPage),
);
check(
  "and an issued report that referenced none shows nothing at all",
  /isFinal && referencedDocuments\.length === 0 \? undefined/.test(dailyPage) &&
    /isFinal && referencedDocuments\.length === 0 \? undefined/.test(summaryPage),
  "a heading over 'No documents were referenced' is a sentence nobody needs",
);

// What may still fold: things that never reach the PDF. The raw notes a
// person dictated are the source the report was written from, shown for
// comparison and printed nowhere; the AI tools are tools, not content.
check(
  "raw notes are not printed in the daily PDF, so showing them is a choice",
  !/rawNotes|raw_notes/.test(dailyPdf),
);

console.log("\n2b. The Daily screen: speak, check, photograph, review, finish");
const finaliseFile = read("../components/reports/finalise-report.tsx");
// Hurricane pass. What was cut was what a site manager had to think about:
// a second gold button before the notes, a sentence under every heading, a
// three-button photo picker with a hint each, the review folded under "More
// tools", the presentation chooser open on every draft, and View/Share at
// the bottom of an issued report.
check("the notes come with no sentence under the label", !/kept word for word, exactly as you said it/.test(captureForm));
check("the write button explains itself only while there is nothing to write", /hasNotes \? null : \(/.test(captureForm) && !/Turns your notes into the written report/.test(captureForm));
check("Site Capture is a quiet way back, not the first thing on the screen", /variant="secondary" size="sm">\s*<Link href=\{`\/reports\/\$\{report\.id\}\/capture`\}/.test(dailyPage));
check("the section hints are off on the Daily", (dailyPage.match(/<ReportSectionCard[^>]*\bquiet\b/g) ?? []).length === 3 && /quiet \? null : <p/.test(sectionCard));
check("photographs are one button on the Daily", /reportId=\{report\.id\}\s*simple\s*\/>/.test(dailyPage));
check("Master Review is in the open, before Finalise, not under More tools", !/More tools/.test(dailyPage) && dailyPage.indexOf("<MasterReviewPanel") < dailyPage.indexOf("{isFinal || loadError ? null : finaliseCard}"));
check("an issued report opens on View report and Share PDF", /\{isFinal && !loadError \? finaliseCard : null\}/.test(dailyPage) && dailyPage.indexOf("finaliseCard : null") < dailyPage.indexOf("<ReportSectionCard group={summaryGroup}"));
check("a draft offers Preview then Finalise", (() => { const i = finaliseFile.indexOf('"Preview"'); const j = finaliseFile.indexOf("<FinaliseButton"); return i > 0 && j > i; })());
check("the presentation chooser folds, with what will issue on the fold", /<details[\s\S]*?describePresentation\(\{ style, hasCover: Boolean\(cover\), photoCount: photos\.length \}\)[\s\S]*?<PdfPresentation/.test(finaliseFile));
check("Cancel is gone from the notes form", !/cancelHref/.test(captureForm) && !/cancelHref/.test(dailyPage));

console.log("\n3. One story, told once");

check(
  "a Daily Report drafts one written section",
  DAILY_DRAFTED_TYPES.length === 1 && DAILY_DRAFTED_TYPES[0] === "executive_summary",
  DAILY_DRAFTED_TYPES.join(","),
);
check(
  "a Progress Report drafts its summary and what is still open",
  PROGRESS_DRAFTED_TYPES.join(",") === "period_summary,next_period",
  PROGRESS_DRAFTED_TYPES.join(","),
);
check(
  "a Completion Report drafts its summary and sign-off, with the table as its own pass",
  COMPLETION_DRAFTED_TYPES.join(",") === "project_overview,sign_off",
  COMPLETION_DRAFTED_TYPES.join(","),
);
check(
  "no report drafts works completed, works in progress or key activities any more",
  ![...DAILY_DRAFTED_TYPES, ...PROGRESS_DRAFTED_TYPES, ...COMPLETION_DRAFTED_TYPES].some((type) =>
    ["works_completed", "works_in_progress", "key_activities", "completed_works", "planned_works", "deliveries_plant", "resources_and_plant"].includes(type),
  ),
  "these were one story told several times",
);
check(
  "the drafting call asks for exactly the drafted set",
  summaryDraftedSectionsFor("completion").map((s) => s.type).join(",") ===
    COMPLETION_DRAFTED_TYPES.join(",") &&
    summaryDraftedSectionsFor("progress").map((s) => s.type).join(",") ===
      PROGRESS_DRAFTED_TYPES.join(","),
);
check(
  "and the daily call asks for one section, not eight",
  /DAILY_DRAFTED_SECTIONS/.test(read("../lib/ai/report-generation.ts")) &&
    !/REPORT_SECTIONS\.map/.test(read("../lib/ai/report-generation.ts")),
);

console.log("\n4. Each report is the shape the owner asked for");

const shape = (kind) =>
  reportStructure(kind).map((group) => `${group.label}[${group.sections.join("+") || "-"}]`).join(" ");

check(
  "DAILY: a summary, evidence, and the issues raised - no other prose",
  shape("daily") === "Daily Summary[executive_summary] Photos & Evidence[-] Issues raised[-]",
  shape("daily"),
);
check(
  "PROGRESS: a summary, evidence, and what is still open",
  shape("progress") ===
    "Progress Overview[period_summary] Photos & Evidence[-] Outstanding / Next Actions[issues_and_resolutions+next_period]",
  shape("progress"),
);
check(
  "COMPLETION: a summary, the instructed works table, evidence, and follow-on",
  shape("completion") ===
    "Completion Summary[project_overview+instructed_works] Photos & Evidence[photographic_record] Outstanding / Follow-on[issues_and_resolutions+sign_off]",
  shape("completion"),
);

console.log("\n4b. The instructed works table is on the screen, and its JSON never is");

// Found on the real build, 5 September 2026: a draft Completion showed a
// textarea of raw JSON labelled "Instructed works and status" and no table,
// while the PDF printed the table. The editor now skips the payload and the
// panel is drawn in every state from the same parse the PDF uses.
check(
  "the group editor never lists the instructed works payload",
  /entry\.group\.sections\.filter\(\(type\) => type !== "instructed_works"\)/.test(summaryPage),
);
check(
  "the table is not gated on the report being final",
  !/isFinal \? \(\s*<>\s*<SectionProse[\s\S]{0,200}InstructedWorksPanel/.test(summaryPage),
);
check(
  "it is drawn after the prose or its editor, in every state",
  /\)\}\s*\{\/\*[\s\S]{0,400}?\*\/\}\s*\{instructedWorks \? <InstructedWorksPanel works=\{instructedWorks\} \/> : null\}\s*<\/ReportSectionCard>/.test(summaryPage),
);
check(
  "from the same parse the PDF uses",
  /parseInstructedWorks\(/.test(summaryPage) && /parseInstructedWorks\(/.test(read("../lib/pdf/summary-document.tsx")),
);
check(
  "and a save of the summary text cannot blank it",
  // readGroupFields reads an absent field as empty; the payload is not in
  // the form, so it must not be in the comparison the save is made from.
  /group\.sections\s*\.filter\(\(type\) => type !== "instructed_works"\)\s*\.map\(/.test(
    read("../app/(app)/summary-reports/ai-actions.ts"),
  ),
);
check(
  "and read-only prose still skips it, so no paragraph of braces either",
  /section\.section_type !== "instructed_works"/.test(summaryPage),
);

console.log("\n5. A section nobody prints is retained, not exported");

// The migration path. A report drafted before the structures shrank still has
// its rows; they are simply no longer part of the document. Nothing deletes
// them, and nothing prints them behind the reader's back.
const legacy = groupSections("daily", [
  { type: "executive_summary", label: "Summary", content: "What the day amounted to." },
  { type: "works_completed", label: "Works completed", content: "Text nobody saw." },
  { type: "planned_works", label: "Planned works", content: "Text nobody saw." },
]);
const out = legacy.flatMap((entry) => entry.entries.map((e) => e.type));
check("the section the structure declares is printed", out.includes("executive_summary"));
check("the retained ones are not", !out.includes("works_completed") && !out.includes("planned_works"));
check("and they are not swept into whichever group happens to be last", out.length === 1, out.join(","));
check(
  "no migration deletes them",
  !/delete from public\.(summary_)?report_sections/i.test(
    read("../supabase/migrations/20260901000011_instructed_works.sql"),
  ),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL WHAT-YOU-SEE CHECKS PASSED");
else { for (const f of failures) console.log(`FAILED: ${f}`); process.exitCode = 1; }
