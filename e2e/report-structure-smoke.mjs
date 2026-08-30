/**
 * Three visible sections, and not one stored section lost on the way there.
 *
 * The grouping in lib/report-structure.ts is presentation only. That claim is
 * worth exactly as much as the checks below make it worth, and two of them are
 * the whole point:
 *
 * - every stored section type has a home in some group, for all four
 *   documents. An unmapped type would vanish from an issued client document,
 *   which is the one failure this product must never have;
 * - the section types themselves are untouched, so the drafting, cleanup and
 *   review layers still see the fine-grained sections that keep them honest.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:report-structure
 */

import {
  ADVANCED_DETAILS_LABEL,
  APPENDIX_LABEL,
  REPORT_STRUCTURES,
  groupKeyOf,
  groupSections,
  reportStructure,
  runInLabel,
} from "../lib/report-structure.ts";
import { REPORT_SECTIONS } from "../lib/report-sections.ts";
import {
  COMPLETION_SECTIONS,
  PROGRESS_SECTIONS,
  SURVEY_SECTIONS,
} from "../lib/summary-reports/sections.ts";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";
import {
  changedSections,
  composeGroupText,
  parseGroupText,
} from "../lib/reports/group-text.ts";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** What each document actually stores, from the definitions the app writes against. */
const STORED = {
  daily: REPORT_SECTIONS,
  progress: PROGRESS_SECTIONS,
  completion: COMPLETION_SECTIONS,
  survey: SURVEY_SECTIONS,
};
const KINDS = Object.keys(STORED);

console.log("\n1. Every document shows exactly three sections");

for (const kind of KINDS) {
  const structure = reportStructure(kind);
  check(`${kind} has three`, structure.length === 3, String(structure.length));
  check(
    `${kind}: their roles are summary, evidence, outstanding, in that order`,
    structure.map((group) => group.key).join(",") === "summary,evidence,outstanding",
    structure.map((group) => group.key).join(","),
  );
  for (const group of structure) {
    check(`${kind}/${group.key} has a heading`, Boolean(group.label.trim()), group.label);
    check(`${kind}/${group.key} has a hint`, Boolean(group.hint.trim()), group.hint);
  }
}

console.log("\n2. The headings are the ones the owner asked for");

const EXPECTED = {
  daily: ["Daily Summary", "Photos & Evidence", "Issues / Next Steps"],
  progress: ["Progress Overview", "Photos & Evidence", "Outstanding / Next Actions"],
  survey: ["Findings", "Photos & Evidence", "Recommendations"],
  completion: ["Completion Summary", "Photos & Evidence", "Outstanding / Sign-off"],
};

for (const [kind, labels] of Object.entries(EXPECTED)) {
  check(
    `${kind}: ${labels.join(" / ")}`,
    reportStructure(kind).map((group) => group.label).join("|") === labels.join("|"),
    reportStructure(kind).map((group) => group.label).join("|"),
  );
}

console.log("\n3. NOT ONE STORED SECTION LOSES ITS HOME");

// The check this file exists for. A section type with no group would be
// written, saved, and then silently missing from the PDF that goes to a
// client.
for (const kind of KINDS) {
  for (const section of STORED[kind]) {
    check(
      `${kind}/${section.type} appears in a group`,
      groupKeyOf(kind, section.type) !== null,
      "unmapped - it would vanish from the issued document",
    );
  }
}

// And nothing is claimed twice: a section printed under two headings is the
// duplication the section-role rules work to prevent, reintroduced in layout.
for (const kind of KINDS) {
  const all = reportStructure(kind).flatMap((group) => group.sections);
  check(
    `${kind}: no section is claimed by two groups`,
    new Set(all).size === all.length,
    all.filter((type, index) => all.indexOf(type) !== index).join(", "),
  );
  // A group naming a type the document does not store is a rename nobody
  // finished: harmless in the output, but it hides the section that is
  // actually missing.
  const stored = new Set(STORED[kind].map((section) => section.type));
  for (const type of all) {
    check(`${kind}: ${type} is a section this document stores`, stored.has(type));
  }
}

console.log("\n4. The stored sections themselves are untouched");

// The layers that keep the writing honest still see every section. If
// grouping had been done in the database instead, these would have shrunk.
check("a daily still stores eight sections", REPORT_SECTIONS.length === 8, String(REPORT_SECTIONS.length));
check("a progress report still stores seven", PROGRESS_SECTIONS.length === 7, String(PROGRESS_SECTIONS.length));
check("a completion report still stores eight", COMPLETION_SECTIONS.length === 8, String(COMPLETION_SECTIONS.length));
check("a survey still stores seven", SURVEY_SECTIONS.length === 7, String(SURVEY_SECTIONS.length));

for (const kind of KINDS) {
  check(
    `${kind}: the cleanup pass still writes every stored section, not three`,
    CLEANUP_SECTIONS[kind].map((section) => section.type).join(",") ===
      STORED[kind].map((section) => section.type).join(","),
  );
}

console.log("\n5. Grouping keeps content, order and status");

const contentFor = (kind) =>
  STORED[kind].map((section) => ({
    type: section.type,
    label: section.label,
    content: `${section.label} content.`,
  }));

for (const kind of KINDS) {
  const sections = contentFor(kind);
  const grouped = groupSections(kind, sections);
  const flattened = grouped.flatMap((entry) => entry.entries);

  check(`${kind}: every section came out the other side`, flattened.length === sections.length);
  check(
    `${kind}: nothing was duplicated`,
    new Set(flattened.map((section) => section.type)).size === flattened.length,
  );
  check(
    `${kind}: each group keeps its own declared order`,
    grouped.every((entry) =>
      entry.entries
        .map((section) => entry.group.sections.indexOf(section.type))
        .every((position, index, positions) => index === 0 || position > positions[index - 1]),
    ),
  );
}

// Empty sections are normal - the drafting prompt returns them for anything
// the notes did not support - so a group must cope with having nothing.
const sparse = groupSections("daily", [
  { type: "works_completed", label: "Works completed", content: "One thing." },
]);
check("a group with nothing in it comes back empty, not missing", sparse.length === 3);
check("and the section lands in the right one", sparse[0].entries.length === 1);
check("with the other groups left empty", sparse[1].entries.length === 0 && sparse[2].entries.length === 0);

// A type nobody mapped must still print. It should never happen - check 3
// fails first - but losing a paragraph is worse than printing it oddly.
const orphaned = groupSections("daily", [{ type: "invented_later", label: "New", content: "Text." }]);
check(
  "an unmapped section is still printed rather than dropped",
  orphaned.flatMap((entry) => entry.entries).length === 1,
);

console.log("\n6. Run-in labels keep the status a dispute would turn on");

const dailyStructure = reportStructure("daily");
check(
  "a section inside a group of several keeps its label",
  runInLabel(dailyStructure[0], "Works completed", 4) === "Works completed.",
);
check(
  "a group with one section does not repeat its own heading",
  runInLabel(dailyStructure[0], "Summary", 1) === null,
);
check(
  "and a section named after its group never labels itself",
  runInLabel(dailyStructure[2], "Issues / Next Steps", 3) === null,
);
check(
  "an existing full stop is not doubled",
  runInLabel(dailyStructure[0], "Works completed.", 2) === "Works completed.",
);

// The distinctions that matter if this document is read next to the raw
// notes months later. Each must still be visible somewhere in its group.
for (const [kind, labels] of [
  ["daily", ["Works completed", "Works in progress", "Planned works"]],
  ["progress", ["Works completed", "Works in progress", "Next period"]],
  ["survey", ["Recommended works", "Findings and existing condition"]],
  ["completion", ["Completed works", "Sign-off"]],
]) {
  const sections = contentFor(kind);
  const grouped = groupSections(kind, sections);
  for (const label of labels) {
    const home = grouped.find((entry) =>
      entry.entries.some((section) => section.label === label),
    );
    check(`${kind}: "${label}" is still labelled in the output`, Boolean(home));
    if (home) {
      check(
        `${kind}: and "${label}" carries a run-in label`,
        runInLabel(home.group, label, home.entries.length) !== null,
      );
    }
  }
}

console.log("\n7. Recorded data has somewhere to go");

check("the appendix is named", /appendix/i.test(APPENDIX_LABEL), APPENDIX_LABEL);
check("and the screens call it something a person understands", Boolean(ADVANCED_DETAILS_LABEL));
check(
  "the evidence group is the same job in every document",
  KINDS.every((kind) => REPORT_STRUCTURES[kind][1].label === "Photos & Evidence"),
);
check(
  "a completion report's photographic record reads directly above the plates",
  REPORT_STRUCTURES.completion[1].sections.includes("photographic_record"),
);

console.log("\n8. The screens show the same three sections as the documents");

const dailyPage = read("../app/(app)/reports/[id]/page.tsx");
const summaryPage = read("../app/(app)/summary-reports/[id]/page.tsx");

for (const [name, source] of [
  ["the daily screen", dailyPage],
  ["the consolidated screen", summaryPage],
]) {
  const cards = source.match(/<ReportSectionCard/g) ?? [];
  check(`${name} renders exactly three sections`, cards.length === 3, String(cards.length));
  check(
    `${name} takes its headings from the shared structure`,
    /reportStructure\(/.test(source) && /groupSections\(/.test(source),
  );
  // Not hard-coded: a heading typed into the page would drift from the PDF's,
  // and a screen organised one way with a document organised another is how
  // somebody sends a report believing it says something it does not.
  for (const label of ["Daily Summary", "Progress Overview", "Findings", "Photos & Evidence"]) {
    check(`${name} does not hard-code "${label}"`, !source.includes(`>${label}<`), label);
  }
}

// The blocks that used to be sections of their own. Each is still on the
// screen - inside a card, or behind its "Advanced details" - and none of them
// is a heading competing with the report any more.
const captureForm = read("../components/reports/report-capture-form.tsx");
check(
  "the date, weather, workforce and plant moved behind a disclosure",
  /<details/.test(captureForm) && /ADVANCED_DETAILS_LABEL/.test(captureForm),
);
for (const kept of ["WorkforceRows", "PlantRows", "report_date", "weather"]) {
  check(`and ${kept} is still on the form`, captureForm.includes(kept));
}
check(
  "the notes come before it, not after",
  captureForm.indexOf("DictationField") < captureForm.indexOf("ADVANCED_DETAILS_LABEL"),
);
check(
  "dictation keeps the label the tests and screen readers find it by",
  /label="Work completed"/.test(captureForm),
);

for (const [name, source] of [
  ["the daily screen", dailyPage],
  ["the consolidated screen", summaryPage],
]) {
  check(
    `${name} keeps supporting documents, behind the disclosure`,
    /advancedLabel="Supporting documents"/.test(source),
  );
  check(`${name} still raises and lists what is open`, /Issue|issues/.test(source));
}
check("the daily screen keeps its workforce and plant rows", /workforceResult/.test(dailyPage));
check("the consolidated screen keeps its source record", /sourceItems/.test(summaryPage));

console.log("\n9. One writing box per section, and nothing lost going in or out");

// The box shows several stored sections at once. Everything below is about the
// one property that matters: text a person typed must come back out of the
// parse, in the section it belongs to, every time.
for (const kind of KINDS) {
  for (const group of reportStructure(kind)) {
    const sections = group.sections.map((type) => ({
      type,
      label: STORED[kind].find((section) => section.type === type)?.label ?? type,
      content: `Text for ${type}.`,
    }));
    if (sections.length === 0) continue;

    const composed = composeGroupText(sections);
    const parsed = parseGroupText(composed, sections);

    check(
      `${kind}/${group.key}: every section survives a round trip unchanged`,
      sections.every((section) => parsed[section.type] === section.content),
      JSON.stringify(parsed),
    );
    check(
      `${kind}/${group.key}: an untouched box reports nothing changed`,
      changedSections(sections, parsed).length === 0,
    );
  }
}

const dailySummary = reportStructure("daily")[0];
const dailySections = dailySummary.sections.map((type) => ({
  type,
  label: REPORT_SECTIONS.find((section) => section.type === type).label,
  content: "",
}));

// The case that matters most on site: an empty box somebody dictates into.
const dictated = parseGroupText("We finished the ducting on the east elevation.", dailySections);
check(
  "text with no headings lands in the group's first section",
  dictated.executive_summary === "We finished the ducting on the east elevation.",
  JSON.stringify(dictated),
);
check(
  "and nothing is dropped for having no heading",
  Object.values(dictated).join("").includes("finished the ducting"),
);

// Editing one part must not claim the others: they stay AI-written and stay
// available to the next regeneration.
const filled = dailySummary.sections.map((type) => ({
  type,
  label: REPORT_SECTIONS.find((section) => section.type === type).label,
  content: `Original ${type}.`,
}));
const edited = parseGroupText(
  composeGroupText(filled).replace("Original works_completed.", "Rewritten by hand."),
  filled,
);
const changed = changedSections(filled, edited);
check("only the section a person altered comes back as changed", changed.length === 1, JSON.stringify(changed));
check("and it is the right one", changed[0]?.type === "works_completed");
check(
  "the others keep their text exactly",
  filled
    .filter((section) => section.type !== "works_completed")
    .every((section) => edited[section.type] === section.content),
);

// A heading a person deleted merges that text upwards rather than losing it.
const merged = parseGroupText(
  composeGroupText(filled).replace(/^Works completed$/m, ""),
  filled,
);
check(
  "deleting a heading merges its text into the section above, never deletes it",
  merged.executive_summary.includes("Original works_completed."),
  JSON.stringify(merged.executive_summary),
);

// A sentence that merely starts with a section's name is prose, not a heading.
const prose = parseGroupText(
  "Works completed to the east elevation were signed for on site.",
  dailySections,
);
check(
  "a sentence beginning with a section name is not treated as a heading",
  prose.executive_summary.startsWith("Works completed to the east"),
  JSON.stringify(prose),
);

// A group holding one stored section needs no heading line at all.
const single = [{ type: "photographic_record", label: "Photographic record", content: "A short introduction." }];
check("a lone section is shown without its label", composeGroupText(single) === "A short introduction.");
check(
  "and parses straight back",
  parseGroupText("Something else entirely.", single).photographic_record === "Something else entirely.",
);

// An empty group offers an empty box rather than a page of headings.
check(
  "an unwritten group composes to nothing",
  composeGroupText(dailySections) === "",
);

console.log("\n10. The screens show one box per section, and it dictates");

const groupEditor = read("../components/reports/group-editor.tsx");
check("the box is the dictation field, not a second implementation", /DictationField/.test(groupEditor));
check("it composes and the action parses", /composeGroupText/.test(groupEditor));
check("it says which section it is saving", /name="groupKey"/.test(groupEditor));
// Photos & Evidence holds no written sections on a daily report, a survey or a
// Progress Report. A box there would save nowhere.
check(
  "a section with no written sections gets no box",
  /if \(sections\.length === 0\) return null;/.test(groupEditor),
);

for (const [name, source] of [
  ["the daily screen", dailyPage],
  ["the consolidated screen", summaryPage],
]) {
  const editors = source.match(/<GroupEditor/g) ?? [];
  check(`${name} has at most three writing boxes`, editors.length <= 3, String(editors.length));
  check(
    `${name} no longer stacks a textarea per stored section`,
    !/SectionEditors/.test(source),
  );
}
// A Progress Report is written by voice like a Daily Report, through the same
// component rather than a second one.
check(
  "there is exactly one dictation implementation",
  /useSpeechInput/.test(read("../components/reports/dictation-field.tsx")) &&
    !/useSpeechInput/.test(groupEditor) &&
    !/useSpeechInput/.test(summaryPage),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL REPORT STRUCTURE CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
