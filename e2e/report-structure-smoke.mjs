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
  APPENDIX_LABEL,
  REPORT_STRUCTURES,
  authoringMode,
  groupKeyOf,
  groupSections,
  reportStructure,
  runInLabel,
} from "../lib/report-structure.ts";
import { DAILY_DRAFTED_TYPES, REPORT_SECTIONS } from "../lib/report-sections.ts";
import {
  COMPLETION_DRAFTED_TYPES,
  COMPLETION_SECTIONS,
  PROGRESS_DRAFTED_TYPES,
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
  daily: ["Daily Summary", "Photos & Evidence", "Issues raised"],
  progress: ["Progress Overview", "Photos & Evidence", "Outstanding / Next Actions"],
  survey: ["Findings", "Photos & Evidence", "Recommendations"],
  completion: ["Completion Summary", "Photos & Evidence", "Outstanding / Follow-on"],
};

for (const [kind, labels] of Object.entries(EXPECTED)) {
  check(
    `${kind}: ${labels.join(" / ")}`,
    reportStructure(kind).map((group) => group.label).join("|") === labels.join("|"),
    reportStructure(kind).map((group) => group.label).join("|"),
  );
}

console.log("\n3. NOT ONE DRAFTED SECTION LOSES ITS HOME");

// The check this file exists for, in its current form. A section the AI writes
// but no group prints would be generated, saved, and then silently missing
// from the PDF that goes to a client.
//
// It used to read "not one STORED section", and that is deliberately no longer
// true. Works completed, works in progress, key activities and the rest are
// still stored types - a report drafted before the structures shrank keeps its
// text, and nothing deletes it - but they are not part of any document now.
// Nothing writes them, so nothing can lose them.
const DRAFTED = {
  daily: DAILY_DRAFTED_TYPES,
  progress: PROGRESS_DRAFTED_TYPES,
  completion: [...COMPLETION_DRAFTED_TYPES, "instructed_works"],
  survey: SURVEY_SECTIONS.map((section) => section.type),
};

for (const kind of KINDS) {
  for (const type of DRAFTED[kind]) {
    check(
      `${kind}/${type} appears in a group`,
      groupKeyOf(kind, type) !== null,
      "unmapped - it would vanish from the issued document",
    );
  }
}

// The other half of the same promise: a type no group prints must be one
// nothing writes, or it is content generated straight into a hole.
for (const kind of KINDS) {
  for (const section of STORED[kind]) {
    if (groupKeyOf(kind, section.type) !== null) continue;
    check(
      `${kind}/${section.type} is retained data, not something still written`,
      !DRAFTED[kind].includes(section.type),
      "generated but never printed",
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
check(
  "a completion report stores nine - eight prose sections plus the instructed works table",
  COMPLETION_SECTIONS.length === 9,
  String(COMPLETION_SECTIONS.length),
);
check("a survey still stores seven", SURVEY_SECTIONS.length === 7, String(SURVEY_SECTIONS.length));

for (const kind of KINDS) {
  if (kind === "completion") {
    // A Completion Report stores nine sections and is written in two: a
    // summary, and what is still open. Completed works is not one of them -
    // the instructed works table already carries what was asked for and what
    // was done, item by item, and a paragraph restating it is the same story
    // twice. Nothing was removed: every stored type is still stored, still
    // editable and still printed where it carries words.
    check(
      "completion: the cleanup pass writes the two the client reads",
      CLEANUP_SECTIONS.completion.map((section) => section.type).join(",") ===
        "project_overview,sign_off",
      CLEANUP_SECTIONS.completion.map((section) => section.type).join(","),
    );
    check(
      "completion: and every one is still a stored section",
      CLEANUP_SECTIONS.completion.every((section) =>
        STORED.completion.some((stored) => stored.type === section.type),
      ),
    );
    continue;
  }
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

  // Every section the structure prints comes out; a retained legacy type is
  // deliberately left behind. Both halves matter: the first is the promise
  // that nothing written is lost, the second is the promise that nothing a
  // person never saw reaches the client.
  const printed = sections.filter((section) => groupKeyOf(kind, section.type) !== null);
  check(
    `${kind}: every section the document prints came out the other side`,
    flattened.length === printed.length,
    `${flattened.length} of ${printed.length}`,
  );
  check(
    `${kind}: a retained legacy type is not carried into the document`,
    flattened.every((section) => groupKeyOf(kind, section.type) !== null),
  );
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
  { type: "executive_summary", label: "Summary", content: "One thing." },
]);
check("a group with nothing in it comes back empty, not missing", sparse.length === 3);
check("and the section lands in the right one", sparse[0].entries.length === 1);
check("with the other groups left empty", sparse[1].entries.length === 0 && sparse[2].entries.length === 0);

// A type no group prints is not printed. This is the rule that changed: it
// used to be appended to the last group so a paragraph could not be lost, and
// the cost was that a Daily Report's issued PDF carried a "Works completed"
// paragraph under "Issues / Next Steps" that nobody had seen on the screen.
// Surprise export content is the worse of the two faults.
const orphaned = groupSections("daily", [
  { type: "works_completed", label: "Works completed", content: "Text nobody saw." },
  { type: "invented_later", label: "New", content: "Text." },
]);
check(
  "a section no group prints is dropped, not appended to whichever group is last",
  orphaned.flatMap((entry) => entry.entries).length === 0,
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
  runInLabel(dailyStructure[2], "Issues raised", 3) === null,
);
check(
  "an existing full stop is not doubled",
  runInLabel(dailyStructure[0], "Works completed.", 2) === "Works completed.",
);

// The distinctions that matter if this document is read next to the raw notes
// months later. Each must still be visible somewhere in its group.
//
// Shorter than it was, and that is the point of this batch: a Daily Report no
// longer separates works completed from works in progress from planned works,
// because those were one day's story told three times and two of them were
// folded away on screen while all three printed. What a Daily distinguishes
// now is the summary from the issues raised.
for (const [kind, labels] of [
  ["progress", ["Next period"]],
  ["survey", ["Recommended works", "Findings and existing condition"]],
  ["completion", ["Outstanding and sign-off"]],
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
check(
  "and the screens show that data inline rather than naming a disclosure",
  !/ADVANCED_DETAILS_LABEL|Advanced details/.test(read("../lib/report-structure.ts")),
);
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
// screen, inline, and none of them is a heading competing with the report any
// more. They were behind "Advanced details" until it turned out a report could
// export a workforce nobody had opened the panel to look at.
const captureForm = read("../components/reports/report-capture-form.tsx");
check(
  "the date, weather, workforce and plant are inline, not folded",
  !/<details/.test(
    captureForm.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, ""),
  ),
);
for (const kept of ["WorkforceRows", "PlantRows", "report_date", "weather"]) {
  check(`and ${kept} is still on the form`, captureForm.includes(kept));
}
check(
  "the notes come before them, not after",
  captureForm.indexOf("DictationField") < captureForm.indexOf("WorkforceRows"),
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
    `${name} keeps supporting documents, inline under their own heading`,
    /recordsLabel="Supporting documents"/.test(source) && !/advanced(Label|Hint)?=/.test(source),
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
// A Daily Report's Issues group carries no prose at all now - the issues are
// records, not paragraphs - so the two-section case below is taken from a
// Progress Report, which still has one.
const progressOutstanding = reportStructure("progress")[2];
// Daily types have their labels here; the Progress group below carries summary
// types, whose label is cosmetic for this proof - what is under test is that a
// field's value cannot move to another section, not what it is called.
const labelOf = (type) =>
  REPORT_SECTIONS.find((section) => section.type === type)?.label ?? type;
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
const planned = sectionsOf(progressOutstanding);
const meddled = readGroupFields(
  formOf({
    ...Object.fromEntries(planned.map((s) => [sectionFieldName(s.type), s.content])),
    [sectionFieldName("next_period")]:
      "Issues and resolutions\nScreed is programmed to start on Monday.",
  }),
  planned,
);
check(
  "text naming another section stays in the section it was typed into",
  meddled.next_period.includes("Screed is programmed to start on Monday."),
  JSON.stringify(meddled.next_period),
);
check(
  "and the section it names is not touched by it",
  meddled.issues_and_resolutions === "Original issues_and_resolutions.",
  JSON.stringify(meddled),
);
check(
  "so only the section that was actually typed in comes back as changed",
  changedSections(planned, meddled).map((section) => section.type).join(",") === "next_period",
  JSON.stringify(changedSections(planned, meddled)),
);

// Emptying one part clears that section and only that one.
const clearable = sectionsOf(progressOutstanding);
const emptied = readGroupFields(
  formOf({
    ...Object.fromEntries(clearable.map((s) => [sectionFieldName(s.type), s.content])),
    [sectionFieldName("issues_and_resolutions")]: "",
  }),
  clearable,
);
check("clearing one part clears that section", emptied.issues_and_resolutions === "");
check(
  "and leaves every other section exactly as it was",
  clearable
    .filter((section) => section.type !== "issues_and_resolutions")
    .every((section) => emptied[section.type] === section.content),
);
check(
  "with only that one reported as changed",
  changedSections(clearable, emptied).map((section) => section.type).join(",") ===
    "issues_and_resolutions",
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
  editableSections(
    sectionsOf(progressOutstanding, (type) => (type === "next_period" ? "Text." : "")),
  )
    .map((section) => section.type)
    .join(",") === "next_period",
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
  // Counted by which visible group each box writes into, not by how many
  // times the component appears: a screen may render the same box in two
  // branches - in front, or folded away - and that is still one writing area.
  const editors = new Set([...source.matchAll(/groupKey="([a-z]+)"/g)].map((match) => match[1]));
  check(`${name} has at most three writing areas`, editors.size <= 3, Array.from(editors).join());
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

console.log("\n11. A daily report is dictated; a consolidated one is written");

check("a daily report is authored from its notes", authoringMode("daily") === "notes");
for (const kind of ["progress", "completion", "survey"]) {
  check(`a ${kind} report is authored in its sections`, authoringMode(kind) === "sections");
}

// Nothing that can reach the client's PDF is folded away on either screen.
// This was once the opposite rule - the editors sat behind "Edit the written
// report", and inside them all but the first section sat behind "Also in this
// section" - which meant a report exported five paragraphs a person had seen
// one of.
const dailyEditors = dailyPage.match(/<GroupEditor/g) ?? [];
check("the daily screen has a writing surface", dailyEditors.length > 0);
check(
  "and no disclosure anywhere near it",
  !/EditDisclosure/.test(dailyPage) && !/EditDisclosure/.test(summaryPage),
);
check(
  "the component that folded it away is gone for good",
  !/export function EditDisclosure/.test(read("../components/reports/report-section-card.tsx")),
);
check(
  "and no section folds inside the editor",
  // The code, not the comment above it that records why the fold went.
  !/<details/.test(groupEditor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
  "every part of a group is rendered, in full",
);
check(
  "the drafted report is shown as prose while it is still a draft",
  /<SectionProse entry=\{groupFor\("summary"\)\} \/>/.test(dailyPage),
);
check(
  "the one writing window is the notes box",
  /<ReportCaptureForm/.test(dailyPage) && /DictationField/.test(captureForm),
);
check(
  "and the editor is still offered where there is no AI to draft with",
  /hasWritten\(key\) \|\| !hasAiConfig\(\)/.test(dailyPage),
);
check(
  "a consolidated report with sources and no words yet says the box is optional",
  /consolidating && !hasWrittenSummary \?/.test(summaryPage) && /Optional\./.test(summaryPage),
  "a hint, not a disclosure",
);
check(
  "and a report written directly still writes in its sections",
  /\) : \(\s*\n\s*<GroupEditor/.test(summaryPage),
);

// The real measure of "how many writing areas": one per visible group, however
// many branches render it.
const summaryEditors = new Set(
  [...summaryPage.matchAll(/groupKey="([a-z]+)"/g)].map((match) => match[1]),
);
check(
  "and has at most three of them",
  summaryEditors.size <= 3 && summaryEditors.size > 0,
  Array.from(summaryEditors).join(),
);
// Progress and survey have two groups carrying written sections; the third is
// photographs, which gets no box at all.
for (const kind of ["progress", "survey"]) {
  const withSections = reportStructure(kind).filter((group) => group.sections.length > 0);
  check(`a ${kind} report has two writing areas`, withSections.length === 2, String(withSections.length));
}
check(
  "a completion report keeps three, as the final record",
  reportStructure("completion").filter((group) => group.sections.length > 0).length === 3,
);

console.log("\n12. Nothing folds, and every part is still posted");

// This section used to prove the opposite: that all but the first part sat
// behind "Also in this section", and that the fold still posted its fields.
// The fold is gone. A section that can reach the client's PDF is on the screen
// the person signs off, and the way that is kept true is that each group
// carries one written section rather than that the extras are hidden well.
const editorCode = groupEditor
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

check("no disclosure of any kind in the editor", !/<details/.test(editorCode));
check("and nothing named 'Also in this section'", !/Also in this section/.test(editorCode));
check(
  "the first part is in front of you",
  /<Part\s*\n\s*part=\{primary\}/.test(editorCode),
);
check(
  "and any others are rendered beside it, not behind anything",
  /\{rest\.map\(\(part\) => \(/.test(editorCode),
);

// THE PROPERTY THAT STILL MATTERS. Every field must be in the document, or the
// browser posts nothing for it, readGroupFields reads it as empty, and saving
// one part silently clears the rest.
check(
  "parts are rendered unconditionally, so the form still posts them",
  !/\{open &&/.test(editorCode) && !/showAll/.test(editorCode),
);
check(
  "and a field's section is still its name",
  (editorCode.match(/name=\{sectionFieldName\(part\.type\)\}/g) ?? []).length === 1,
);

// Proof of the consequence, at the level the save actually works on: a form
// that posts every part - which is what a fold does - changes nothing it was
// not asked to change.
const foldedForm = readGroupFields(
  formOf(Object.fromEntries(filled.map((s) => [sectionFieldName(s.type), s.content]))),
  filled,
);
check(
  "a form carrying every part, opened or not, clears nothing",
  changedSections(filled, foldedForm).length === 0,
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL REPORT STRUCTURE CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
