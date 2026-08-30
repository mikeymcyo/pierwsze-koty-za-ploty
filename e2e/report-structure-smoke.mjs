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
  SECTION_FIELD_PREFIX,
  changedSections,
  editableSections,
  readGroupFields,
  sectionFieldName,
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

console.log("\n9. Editing prose cannot move it into another stored section");

// The fault this section exists for. The first version of the one-box editor
// separated a group's sections with their names on a line inside the textarea
// and split the text back apart on save, so deleting that line - easy to do
// one-handed on a phone - silently moved next Monday's planned works into last
// Friday's completed works. A status nobody changed, in a document that gets
// read back in a dispute.
//
// The boundary is now the field a person typed into. Everything below is a
// proof that no edit to prose can reclassify it.

const dailySummary = reportStructure("daily")[0];
const dailyOutstanding = reportStructure("daily")[2];
const labelOf = (type) => REPORT_SECTIONS.find((section) => section.type === type).label;
const sectionsOf = (group, contentFor = (type) => `Original ${type}.`) =>
  group.sections.map((type) => ({ type, label: labelOf(type), content: contentFor(type) }));

// A form is a set of named fields. This is what the browser actually posts.
const formOf = (values) => (name) => values[name];

const filled = sectionsOf(dailySummary);
const untouched = readGroupFields(
  formOf(Object.fromEntries(filled.map((s) => [sectionFieldName(s.type), s.content]))),
  filled,
);
check(
  "an untouched form gives every section back its own text",
  filled.every((section) => untouched[section.type] === section.content),
  JSON.stringify(untouched),
);
check("and reports nothing changed", changedSections(filled, untouched).length === 0);

// THE CASE THE TESTER NAMED. Somebody deletes what looks like a heading, and
// types the words "Works completed" into the middle of their planned works.
// Neither can move a word out of planned works, because the section a field
// belongs to is not written in the box.
const planned = sectionsOf(dailyOutstanding);
const meddled = readGroupFields(
  formOf({
    ...Object.fromEntries(planned.map((s) => [sectionFieldName(s.type), s.content])),
    [sectionFieldName("planned_works")]:
      "Works completed\nOutstanding items\nScreed is programmed to start on Monday.",
  }),
  planned,
);
check(
  "text naming another section stays in the section it was typed into",
  meddled.planned_works.includes("Screed is programmed to start on Monday."),
  JSON.stringify(meddled.planned_works),
);
check(
  "and the section it names is not touched by it",
  meddled.works_completed === undefined && meddled.outstanding_items === "Original outstanding_items.",
  JSON.stringify(meddled),
);
check(
  "so only the section that was actually typed in comes back as changed",
  changedSections(planned, meddled).map((section) => section.type).join(",") === "planned_works",
  JSON.stringify(changedSections(planned, meddled)),
);

// Emptying one part clears that section and only that one.
const emptied = readGroupFields(
  formOf({
    ...Object.fromEntries(filled.map((s) => [sectionFieldName(s.type), s.content])),
    [sectionFieldName("works_completed")]: "",
  }),
  filled,
);
check("clearing one part clears that section", emptied.works_completed === "");
check(
  "and leaves every other section exactly as it was",
  filled
    .filter((section) => section.type !== "works_completed")
    .every((section) => emptied[section.type] === section.content),
);
check(
  "with only that one reported as changed",
  changedSections(filled, emptied).map((section) => section.type).join(",") === "works_completed",
);

// A missing field is an empty section, never another section's text.
const partial = readGroupFields(formOf({}), filled);
check(
  "a form that carried no fields writes no text anywhere",
  filled.every((section) => partial[section.type] === ""),
);

// A field naming a section of a different group is not read at all, so a
// handmade request cannot write a section the form was not showing.
const crossGroup = readGroupFields(
  formOf({
    [sectionFieldName("works_completed")]: "Legitimate.",
    [sectionFieldName("planned_works")]: "Injected from another group.",
  }),
  filled,
);
check(
  "a field for a section outside this group is ignored",
  crossGroup.planned_works === undefined &&
    Object.values(crossGroup).every((value) => !value.includes("Injected")),
  JSON.stringify(crossGroup),
);

// Whitespace-only differences are not edits: they must not flip a section to
// "written by a person" and exempt it from the next regeneration.
const respaced = readGroupFields(
  formOf(
    Object.fromEntries(filled.map((s) => [sectionFieldName(s.type), `  ${s.content}  `])),
  ),
  filled,
);
check("padding a section with spaces is not an edit", changedSections(filled, respaced).length === 0);

check("field names are prefixed so they cannot collide", SECTION_FIELD_PREFIX.length > 0);
check(
  "and are derived from the section type, not its wording",
  sectionFieldName("works_completed") === `${SECTION_FIELD_PREFIX}works_completed`,
);

console.log("\n9b. Which parts of a group get a box");

check(
  "the ones already written",
  editableSections(sectionsOf(dailySummary, (type) => (type === "works_completed" ? "Text." : "")))
    .map((section) => section.type)
    .join(",") === "works_completed",
);
check(
  "and where nothing is written, the first, so there is somewhere to start",
  editableSections(sectionsOf(dailySummary, () => "")).map((section) => section.type).join(",") ===
    "executive_summary",
);
check(
  "never every stored section at once - that was the eight boxes this removed",
  editableSections(sectionsOf(dailySummary, () => "")).length === 1,
);
check("a group with no sections gets nothing", editableSections([]).length === 0);

console.log("\n10. The screens show one writing area per section, and it dictates");

const groupEditor = read("../components/reports/group-editor.tsx");
check(
  "the section a field belongs to is decided in code, not typed by a person",
  /name=\{sectionFieldName\(part\.type\)\}/.test(groupEditor),
);
check(
  "the part names are page furniture, not text in a box",
  /<span[\s\S]{0,200}\{part\.label\}/.test(groupEditor),
);
check(
  "nothing splits prose back apart any more",
  !/parseGroupText|composeGroupText/.test(groupEditor) &&
    !/parseGroupText|composeGroupText/.test(read("../lib/reports/group-text.ts")),
);
check("it says which section it is saving", /name="groupKey"/.test(groupEditor));
// Photos & Evidence holds no written sections on a daily report, a survey or a
// Progress Report. A box there would save nowhere.
check(
  "a section with no written sections gets no box",
  /if \(parts\.length === 0\) return null;/.test(groupEditor),
);
check(
  "the parts are fixed at mount, so none appears under a thumb mid-sentence",
  /useState\(\(\) => editableSections\(sections\)\)/.test(groupEditor),
);

for (const [name, source] of [
  ["the daily screen", dailyPage],
  ["the consolidated screen", summaryPage],
]) {
  const editors = source.match(/<GroupEditor/g) ?? [];
  check(`${name} has at most three writing areas`, editors.length <= 3, String(editors.length));
  check(
    `${name} no longer stacks a textarea per stored section`,
    !/SectionEditors/.test(source),
  );
}

// A Progress Report is written by voice like a Daily Report, through the one
// speech implementation rather than a second one.
const dictationField = read("../components/reports/dictation-field.tsx");
const speechHook = read("../lib/hooks/use-speech-input.ts");
check("both writing surfaces dictate", /useSpeechInput/.test(groupEditor) && /useSpeechInput/.test(dictationField));
check(
  "and there is only one implementation of dictation",
  /SpeechRecognition/.test(speechHook) &&
    !/SpeechRecognition/.test(groupEditor) &&
    !/SpeechRecognition/.test(dictationField),
);
check(
  "dictation goes into the part being written in",
  /onFocus=\{\(\) => setTarget\(part\.type\)\}/.test(groupEditor),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL REPORT STRUCTURE CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
