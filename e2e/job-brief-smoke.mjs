/**
 * What the job is supposed to be.
 *
 * Somebody is sent to Store 1848 to repair a leaking bakery sink and rectify
 * the warehouse doors. That is the job, and it arrives as a sentence in a van
 * at seven in the morning - not as a purchase order. The PO may follow that
 * afternoon, next week, or never.
 *
 * So what is checked here is that a spoken brief is valid scope on its own,
 * that a document arriving later strengthens it without erasing it, that the
 * brief reaches every AI layer, and that nothing anywhere may turn a scope
 * item into work that happened.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:job-brief
 */

import { readFileSync } from "node:fs";

import {
  appendBriefEntry,
  briefAlreadyEnds,
  briefDocumentIds,
  briefForPrompt,
  briefHasDocument,
  briefSummary,
  documentEntryText,
  hasJobBrief,
  isBriefStamp,
  parseJobBrief,
} from "../lib/projects/job-brief.ts";
import {
  JOB_BRIEF_LABEL,
  JOB_CONTEXT_RULES,
  PHOTO_SCOPE_RULES,
  jobContextBlock,
} from "../lib/ai/job-context.ts";
import { CLEANUP_SYSTEM_PROMPT_TAIL } from "../lib/ai/cleanup-prompt.ts";
import { PHOTO_DESCRIPTION_SYSTEM_PROMPT, PHOTO_SCOPE_BLOCK, buildPhotoDescriptionPrompt } from "../lib/ai/photo-prompt.ts";
import { buildPrompt } from "../lib/ai/prompt.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const SPOKEN =
  "We're attending Store 1848 to repair a leaking bakery sink and rectify the warehouse doors. Access may be difficult due to deliveries.";
const PO_ID = "8c5de434-3eea-46c7-8a93-76723f3ce018";

console.log("\n1. A spoken brief is scope on its own, before any document");

const morning = appendBriefEntry(null, SPOKEN, "2026-09-01 07:12");
check("it saves", morning === `[2026-09-01 07:12] ${SPOKEN}`, morning);
check("it reads back as one entry", parseJobBrief(morning).length === 1);
check("with its words intact", parseJobBrief(morning)[0].text === SPOKEN);
check("and its time", parseJobBrief(morning)[0].at === "2026-09-01 07:12");
check("naming no document, because there is none", parseJobBrief(morning)[0].documentId === null);
check("it is valid context to a prompt", briefForPrompt(morning)?.includes(SPOKEN) === true);
check(
  "and the screen summarises it without paraphrasing",
  briefSummary(morning)?.text.startsWith("We're attending Store 1848 to repair"),
  "a screen that paraphrased the brief would be inventing scope",
);
check("no document is counted", briefSummary(morning)?.documents === 0);
check("nothing recorded is no summary at all", briefSummary(null) === null);
check("a stamp is a stamp", isBriefStamp("2026-09-01 07:12") && !isBriefStamp("07:12"));

console.log("\n2. The PO arrives later, and does not rewrite history");

const midday = appendBriefEntry(
  morning,
  "Doors are worse than described - both closers need replacing.",
  "2026-09-01 11:05",
);
const afternoon = appendBriefEntry(
  midday,
  documentEntryText("Lidl PO 4501234567", PO_ID),
  "2026-09-01 14:38",
);

check("the morning brief is still first, character for character", afternoon.startsWith(morning));
check("and still says what it said", afternoon.includes(SPOKEN));
check("three entries, in order", parseJobBrief(afternoon).map((e) => e.at).join() ===
  "2026-09-01 07:12,2026-09-01 11:05,2026-09-01 14:38");
check("the document is on the record as arriving last", parseJobBrief(afternoon)[2].documentId === PO_ID);
check("and can be found by id", briefDocumentIds(afternoon).join() === PO_ID);
check("so the screen knows it is already scope", briefHasDocument(afternoon, PO_ID));
check("and a document nobody added is not", !briefHasDocument(afternoon, "00000000-0000-0000-0000-000000000000"));
check(
  "the summary still leads with what the job is, not with the paperwork",
  briefSummary(afternoon)?.text.startsWith("We're attending"),
);
check("counting the document", briefSummary(afternoon)?.documents === 1);
check("and every entry", briefSummary(afternoon)?.entries === 3);

// Appending is only ever addition, whatever it is appended to.
for (const previous of [null, undefined, "", "   ", "a description written before this existed", afternoon]) {
  const next = appendBriefEntry(previous, "added", "2026-09-02 08:00");
  const head = (typeof previous === "string" ? previous : "").replace(/\s+$/, "");
  check(`appending to ${JSON.stringify(previous)?.slice(0, 40)} keeps it`, next.startsWith(head));
}
check("an empty entry changes nothing", appendBriefEntry(morning, "   ") === morning);
check(
  "and a repeated tap is recognised rather than written twice",
  briefAlreadyEnds(afternoon, documentEntryText("Lidl PO 4501234567", PO_ID), "2026-09-01 14:38"),
);

console.log("\n3. A project written before this existed still reads");

const legacy = "External works to the car park, phase two.";
check("it is one entry", parseJobBrief(legacy).length === 1);
check("with its words untouched", parseJobBrief(legacy)[0].text === legacy);
check("and no invented time", parseJobBrief(legacy)[0].at === null);
check("it is still valid context", briefForPrompt(legacy) === legacy);
check("and a new entry appends after it", appendBriefEntry(legacy, "new", "2026-09-01 09:00").startsWith(legacy));

console.log("\n4. The brief reaches every layer that writes");

const block = jobContextBlock(afternoon);
check("the block carries the brief", block.includes(SPOKEN));
check("under a heading saying what it is", block.includes(JOB_BRIEF_LABEL));
check("and the rules for reading it", block.includes(JOB_CONTEXT_RULES));
check("no brief is no block", jobContextBlock(null) === null && jobContextBlock("  ") === null);

const dailyPrompt = buildPrompt({
  projectName: "Lidl 1848",
  client: null,
  siteAddress: null,
  reportDate: "2026-09-01",
  weather: null,
  authorName: null,
  workforce: "",
  plant: "",
  photos: "",
  rawNotes: "Sorted the doors and the sink.",
  jobBrief: block,
});
check("the daily writer is given it", dailyPrompt.includes(SPOKEN));
check("before the notes, which are the record", dailyPrompt.indexOf(SPOKEN) < dailyPrompt.indexOf("Sorted the doors"));
check("a daily with no brief carries none", !buildPrompt({
  projectName: "x", client: null, siteAddress: null, reportDate: "2026-09-01",
  weather: null, authorName: null, workforce: "", plant: "", photos: "", rawNotes: "notes",
}).includes(JOB_BRIEF_LABEL));

const photoPrompt = buildPhotoDescriptionPrompt({
  projectName: "Lidl 1848",
  client: null,
  siteAddress: null,
  reportDate: "2026-09-01",
  statusLabel: null,
  existingCaption: null,
  reportContext: null,
  jobBrief: block,
});
check("the photograph describer is given it", photoPrompt.includes("warehouse doors"));
check(
  "with its own tighter rule in the system prompt",
  PHOTO_DESCRIPTION_SYSTEM_PROMPT.includes(PHOTO_SCOPE_BLOCK),
);
check(
  "and that rule has not drifted from the shared one",
  PHOTO_SCOPE_BLOCK === PHOTO_SCOPE_RULES,
  "two copies of a rule is one copy that will be wrong",
);

const dailyActions = read("../app/(app)/reports/ai-actions.ts");
const summaryActions = read("../app/(app)/summary-reports/ai-actions.ts");
const photoActions = read("../app/(app)/reports/photo-actions.ts");
check("the daily cleanup pass gets it", /label: JOB_BRIEF_LABEL, text: jobBrief/.test(dailyActions));
check("the daily drafting pass gets it", /jobBrief: jobContextBlock\(jobBrief\)/.test(dailyActions));
check("progress and completion get it", /label: JOB_BRIEF_LABEL, text: jobBrief/.test(summaryActions));
check("their writer too", /jobBrief: jobContextBlock\(jobBrief\)/.test(summaryActions));
check("the photograph describer too", /jobBrief: jobContextBlock\(briefForPrompt\(project\?\.description\)\)/.test(photoActions));
check(
  "and every one of them reads it from the project",
  /projects\(name, client, site_address, description\)/.test(dailyActions) &&
    /projects\(name, client, site_address, description\)/.test(summaryActions),
);
check(
  "the consolidated writer prints it before the evidence",
  /\.\.\.\(input\.jobBrief \? \["", input\.jobBrief\] : \[\]\)/.test(
    read("../lib/ai/summary-generation.ts"),
  ),
);

console.log("\n5. Scope is never evidence");

for (const [where, prompt] of [
  ["the shared rules", JOB_CONTEXT_RULES],
  ["the cleanup pass", CLEANUP_SYSTEM_PROMPT_TAIL],
]) {
  check(`${where}: a scope item is never work completed`, /never write a scope item as work completed/i.test(prompt), where);
  check(`${where}: nothing is invented from it`, /never invent a requirement/i.test(prompt));
  check(`${where}: quoted work is not instructed work`, /not instructed work/i.test(prompt));
  check(`${where}: a later document does not erase the earlier entry`, /erase/i.test(prompt));
}
check(
  "the rules say what the brief IS for",
  /which door, which sink/.test(JOB_CONTEXT_RULES),
);
check(
  "and that a document outranks a remembered conversation",
  /carries more weight than a remembered conversation/.test(JOB_CONTEXT_RULES),
);
check(
  "without implying the works began when the paperwork did",
  /a report\s+that implies the works began only when the paperwork arrived is a false\s+record/.test(
    JOB_CONTEXT_RULES,
  ),
);
check(
  "a photograph may be tied to a scope item only where it plainly shows it",
  /plainly shows it/.test(PHOTO_SCOPE_RULES),
);
check(
  "and never guessed at",
  /Where you are not sure, say nothing about the scope/.test(PHOTO_SCOPE_RULES),
);
check(
  "nor claimed as completed or approved",
  /Never say a photograph shows work completed, approved, tested or signed off/.test(PHOTO_SCOPE_RULES),
);

console.log("\n6. Document control: three separate acts");

const briefActions = read("../app/(app)/projects/brief-actions.ts");
const briefUi = read("../components/projects/job-brief.tsx");
check("adding a document to the scope writes the brief", /appendBriefEntry\(\s*\n?\s*project\.description,\s*\n?\s*documentEntryText/.test(briefActions));
check(
  "and nothing else - no report reference, no PDF append",
  !/report_documents|summary_report_documents|documentsAppended/.test(briefActions),
);
check(
  "the screen says so in words",
  /does not put it in a report or\s+attach it to a PDF/.test(briefUi),
);
check("a document from another project is refused", /\.eq\("project_id", projectId\)/.test(briefActions));
check("and adding one twice is not a second event", /briefHasDocument\(project\.description, document\.id\)/.test(briefActions));
check(
  "the brief write is conditional, so two people cannot overwrite each other",
  /\.eq\("description", project\.description\)/.test(briefActions),
);
check("and retried rather than lost", /APPEND_ATTEMPTS/.test(briefActions));

console.log("\n7. Where it appears");

const capturePage = read("../app/(app)/reports/[id]/capture/page.tsx");
const projectPage = read("../app/(app)/projects/[id]/page.tsx");
check("Site Capture leads with the brief", /<JobBrief/.test(capturePage));
check(
  "above the capture box",
  capturePage.indexOf("<JobBrief") < capturePage.indexOf("<SiteCaptureForm"),
);
check("the project page carries the full one", /<JobBrief/.test(projectPage));
check("with its documents", /documents=\{briefDocuments\}/.test(projectPage));
check("marked with which are already scope", /inScope: scopeIds\.has\(row\.id\)/.test(projectPage));
check("an enquiry has no job to brief yet", /!enquiry \?/.test(projectPage));
check("the box empties only when an entry landed", /key=\{entries\.length\}/.test(briefUi));
check("and the same dictation component is used", /DictationField/.test(briefUi));

console.log("\n8. Nothing that was working stopped working");

check("Site Capture still appends its notes", /appendCapture\(current\.raw_notes/.test(read("../app/(app)/reports/capture-actions.ts")));
check("hand-written sections are still protected", /partitionDraft/.test(dailyActions));
check("an issued report still takes no redraft", /REPORT_IS_FINAL/.test(dailyActions));
check("the cleanup pass still runs first", dailyActions.indexOf("cleanedSectionsFor") < dailyActions.indexOf("generateSections"));
check("photographs are still described but never written", /return result\.ok \? \{ description: result\.description \}/.test(photoActions));
check("and no migration was needed", !/alter table|create table/i.test(briefActions));

console.log("\n9. A brief already recorded is a brief");

// The bug this section exists for: a project with a scope dictated that
// morning, an empty new-entry box, one tap - and SiteBoss answered in red with
// "Say or type the job brief first". That sentence says the job has no brief.
// It has one, showing on the same screen. The empty box is for adding ANOTHER
// entry, and adding nothing to a brief is not a missing brief.

check("a dictated brief means the job has one", hasJobBrief(morning));
check("so does one with a document in it", hasJobBrief(afternoon));
check("a plain description written before any of this counts too", hasJobBrief(legacy));
check("a document entry on its own still counts", hasJobBrief(`[2026-09-01 14:38] ${documentEntryText("Lidl PO 4501234567", PO_ID)}`));
check("and nothing recorded is genuinely nothing", !hasJobBrief(null) && !hasJobBrief("") && !hasJobBrief("   "));
check(
  "the screen and the action ask the same question of the same text",
  hasJobBrief(afternoon) === (parseJobBrief(afternoon).length > 0),
);

check(
  "the box is no longer required to be filled before the project is read",
  !/min\(1,\s*"Say or type the job brief first"\)/.test(briefActions),
  "returning that from the schema answered before knowing whether a brief exists",
);
check(
  "the project is read first, then an empty box is interpreted",
  briefActions.indexOf('.select("id, description")') <
    briefActions.indexOf("nothingToAdd(hasJobBrief(project.description))"),
);
check(
  "empty box + existing brief = nothing added, and no error at all",
  /hasBrief\s*\?\s*\{ empty: true \}/.test(briefActions),
);
check(
  "empty box + genuinely no brief = the warning, still",
  /:\s*\{ error: "Say or type the job brief first", empty: true \}/.test(briefActions),
);
check(
  "the exact case: one saved brief, empty box, NO warning",
  hasJobBrief(morning) && /hasBrief\s*\?\s*\{ empty: true \}/.test(briefActions),
  "one entry recorded + an empty new-entry box must produce no missing-brief warning",
);

check(
  "the screen colours a missing brief red and an empty box not at all",
  /const nothingAdded = Boolean\(state\.empty\) && !state\.error/.test(briefUi) &&
    /nothingAdded \? \(\s*<p className="text-sm text-ink-subtle">/.test(briefUi),
);
check(
  "the only danger Alert for an entry is a real error",
  /\{state\.error \? <Alert tone="danger">\{state\.error\}<\/Alert> : null\}/.test(briefUi),
);
check(
  "the box says it is for another entry once one exists",
  /Add another scope update or instruction/.test(briefUi),
);
check("and its button says so too", /additive \? "Add to the brief" : "Save job brief"/.test(briefUi));
check(
  "an empty box simply has nothing to add, rather than being refused afterwards",
  /const nothingToAdd = text\.trim\(\)\.length === 0/.test(briefUi) &&
    /disabled=\{nothingToAdd\}/.test(briefUi),
);
check(
  "and the append rules underneath are untouched",
  /appendBriefEntry\(project\.description, parsed\.data\.text, stamp\)/.test(briefActions) &&
    !/\.update\(\{ description: parsed\.data\.text \}\)/.test(briefActions),
  "Save appends, it never replaces",
);

console.log("\n10. Site Capture is a microphone, not a reading screen");

check("the brief is summarised there rather than printed in full", /if \(compact\)/.test(briefUi));
check("in the words somebody recorded", /briefSummary\(description\)/.test(briefUi));
check("kept to two lines", /line-clamp-2/.test(briefUi));
check("with the history and the add box behind a disclosure", /<details/.test(briefUi));
check("still above the capture box", capturePage.indexOf("<JobBrief") < capturePage.indexOf("<SiteCaptureForm"));
check("and asked for compactly", /<JobBrief[\s\S]{0,200}compact/.test(capturePage));
check(
  "the full history is still on the project page",
  /<JobBrief/.test(projectPage) && !/compact/.test(projectPage),
);
check(
  "and both screens render the same history component",
  (briefUi.match(/<BriefHistory entries=\{entries\} \/>/g) ?? []).length === 2,
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL JOB BRIEF CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
