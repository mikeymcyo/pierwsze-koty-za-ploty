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

// The one disclosure left on a report screen holds recorded data a person
// typed themselves - workforce rows, plant, the document register, the source
// record. It is not narrative, and this check pins it to that.
const advancedOnly = (page) =>
  [...page.matchAll(/<ReportSectionCard[\s\S]*?>/g)].every(
    (match) => !/children|GroupEditor/.test(match[0]),
  );
check("the remaining disclosure is the recorded-data one", advancedOnly(dailyPage));
check(
  "and it is named as advanced details, not as writing",
  /advanced=\{/.test(dailyPage) || /advanced=\{/.test(summaryPage),
);

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
