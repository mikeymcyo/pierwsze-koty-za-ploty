/**
 * Site Capture: one Daily Report, collected into all day.
 *
 * The thing that must never break is the one a site manager would only notice
 * after losing a morning's work - a second capture replacing the first, or a
 * second report appearing for the same day. So the append is checked as an
 * algebraic property (the result always begins with everything that was
 * already there), the read-back is checked against text nobody formatted, and
 * the action and its wiring are read from source.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:site-capture
 */

import { readFileSync, readdirSync } from "node:fs";

import {
  appendCapture,
  captureCount,
  capturePreview,
  captureSpan,
  isCaptureTime,
  parseCaptureLog,
} from "../lib/reports/capture-log.ts";
import { CLEANUP_SOURCE_LABEL, CLEANUP_SYSTEM_PROMPT_HEAD } from "../lib/ai/cleanup-prompt.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. A clock time, and nothing else");

for (const good of ["00:00", "08:14", "10:32", "14:05", "23:59"]) {
  check(`${good} is a time`, isCaptureTime(good) === true);
}
for (const bad of ["8:14", "24:00", "12:60", "1234", "", null, undefined, 814, "08:14 "]) {
  check(`${JSON.stringify(bad)} is not`, isCaptureTime(bad) === false);
}

console.log("\n2. A day of captures, appended and never overwritten");

// The working day from the brief: speak at eight, come back at half ten, come
// back again at two.
const morning = appendCapture(null, "Poured the slab in the north bay.", "08:00");
const midday = appendCapture(morning, "Steel delivery arrived, offloaded to the compound.", "10:30");
const afternoon = appendCapture(midday, "Slab covered, second pour moved to Thursday.", "14:00");

check("the first capture starts the log", morning === "[08:00] Poured the slab in the north bay.");
check("the second keeps the first, word for word", midday.startsWith(morning));
check("and the third keeps both", afternoon.startsWith(midday));
check(
  "every word of the morning is still there at the end of the day",
  afternoon.includes("Poured the slab in the north bay."),
);
check(
  "and so is the middle of the day",
  afternoon.includes("Steel delivery arrived, offloaded to the compound."),
);

// The property, not the example: appending is only ever addition.
const shapes = [
  null,
  undefined,
  "",
  "   ",
  "notes written before Site Capture existed",
  "[08:00] one\n\n[09:00] two",
  "a line\nand another\n\n",
  "[99:99] not a marker",
];
for (const previous of shapes) {
  const next = appendCapture(previous, "added text", "12:00");
  const head = (typeof previous === "string" ? previous : "").replace(/\s+$/, "");
  check(
    `appending to ${JSON.stringify(previous)} keeps every character that was there`,
    next.startsWith(head),
    next,
  );
  check(`and adds the new words`, next.includes("added text"), next);
}

check(
  "an empty capture changes nothing at all",
  appendCapture("[08:00] one", "   ") === "[08:00] one",
);
check("and neither does an empty capture on an empty log", appendCapture(null, "") === "");

console.log("\n3. Reading the day back");

const entries = parseCaptureLog(afternoon);
check("three captures went in, three come back", entries.length === 3, String(entries.length));
check("in the order they were spoken", entries.map((entry) => entry.at).join() === "08:00,10:30,14:00");
check("with the marker stripped from the words", entries[0].text === "Poured the slab in the north bay.");
check("and the last one intact", entries[2].text === "Slab covered, second pour moved to Thursday.");
check("the count agrees", captureCount(afternoon) === 3);

const span = captureSpan(entries);
check("the day spans first to last", span?.first === "08:00" && span?.last === "14:00");
check("and an untimed log claims no span", captureSpan(parseCaptureLog("just notes")) === null);

// Every report written before Site Capture existed. These must read as one
// note, not as nothing.
const legacy = "Slab poured today, sparks on site, two loads of blocks in.";
check("notes with no markers are one capture", parseCaptureLog(legacy).length === 1);
check("and are returned untouched", parseCaptureLog(legacy)[0].text === legacy);
check("and are untimed rather than given a time", parseCaptureLog(legacy)[0].at === null);

check("nothing at all reads as no captures", parseCaptureLog(null).length === 0);
check("and whitespace does too", parseCaptureLog("   \n\n ").length === 0);

// Text typed before the first marker belongs to the report, not to a capture.
const mixed = parseCaptureLog("typed in the office\n\n[09:15] said on site");
check("text before the first marker survives", mixed.length === 2 && mixed[0].at === null);
check("and keeps its words", mixed[0].text === "typed in the office");
check("while the marked one is timed", mixed[1].at === "09:15" && mixed[1].text === "said on site");

// A multi-line capture is one capture.
const wrapped = parseCaptureLog("[08:00] first line\nsecond line\nthird line");
check("a capture may run to several lines", wrapped.length === 1);
check("and keeps all of them", wrapped[0].text === "first line\nsecond line\nthird line");

console.log("\n4. Nothing a person can type moves their words somewhere else");

// The tester's rule from the section-boundary batch, applied here: a marker is
// informational. Damaging one may change where a list draws a line; it must
// never lose a word or move it into another status.
const damaged = [
  "[08:00] one\n\n[10:30] two",
  "08:00] one\n\n[10:30] two",
  "[8:00] one\n\n[10:30] two",
  "one\n\n[10:30] two",
  "[08:00] one\n\n10:30 two",
  "[08:00] one\n[10:30] two",
];
for (const text of damaged) {
  const parsed = parseCaptureLog(text);
  const rebuilt = parsed.map((entry) => entry.text).join(" ");
  check(
    `"${text.replace(/\n/g, "\\n")}" keeps the word one`,
    rebuilt.includes("one"),
    rebuilt,
  );
  check(`and keeps the word two`, rebuilt.includes("two"), rebuilt);
}

// A bracketed time in the middle of a sentence is a sentence, not a boundary.
const inline = parseCaptureLog("[08:00] delivery booked for [10:30] tomorrow");
check("a bracket mid-line is ordinary text", inline.length === 1, String(inline.length));
check("and stays in the words", inline[0].text === "delivery booked for [10:30] tomorrow");

console.log("\n5. The list on screen stays a list");

check("a long capture is cut for the preview", capturePreview("x".repeat(400)).length <= 160);
check("a short one is left alone", capturePreview("short note") === "short note");
check("and line breaks are flattened", capturePreview("one\n\ntwo") === "one two");

console.log("\n6. One report a day, opened again and again");

const actions = read("../app/(app)/reports/capture-actions.ts");
const openStart = actions.indexOf("export async function openSiteCapture");
const openEnd = actions.indexOf("\nconst captureSchema", openStart);
const open = actions.slice(openStart, openEnd === -1 ? undefined : openEnd);

check("it looks for an existing report first", /from\("reports"\)[\s\S]{0,200}\.select\("id"\)/.test(open));
check("only a draft", /\.eq\("status", "draft"\)/.test(open));
check("only this project", /\.eq\("project_id", projectId\)/.test(open));
check("only today", /\.eq\("report_date", today\(\)\)/.test(open));
check("and opens it rather than making another", /if \(existing\) redirect\(`\/reports\/\$\{existing\.id\}\/capture`\)/.test(open));
check("a new one is only inserted when there is none", open.indexOf(".insert(") > open.indexOf("if (existing)"));
check("today is the same day the database means", /toISOString\(\)\.slice\(0, 10\)/.test(actions));
check(
  "the oldest draft wins where there are somehow two",
  /\.order\("created_at", \{ ascending: true \}\)/.test(open),
);

console.log("\n7. A capture is added, never substituted");

const addStart = actions.indexOf("export async function addCapture");
const add = actions.slice(addStart);

check("only the new words are read from the form", /formData\.get\("capture_text"\)/.test(add));
check(
  "the existing notes are never taken from the form",
  !/formData\.get\("raw_notes"\)/.test(actions),
  "a browser must not be able to post the whole day back",
);
check("the notes are read from the database", /\.select\("id, project_id, raw_notes, status"\)/.test(add));
check("and the new text is appended to them", /appendCapture\(current\.raw_notes/.test(add));
check(
  "the write refuses if somebody else got there first",
  /\.eq\("raw_notes", current\.raw_notes\)/.test(add) && /\.is\("raw_notes", null\)/.test(add),
);
check("and it tries again rather than losing the capture", /APPEND_ATTEMPTS/.test(add));
check("an issued report takes no capture", /REPORT_IS_FINAL/.test(add));
check("and the write says draft too", /\.eq\("status", "draft"\)/.test(add));
check("nothing here writes a report section", !/report_sections/.test(actions));
check("and nothing deletes", !/\.delete\(/.test(actions));

console.log("\n8. The screen a site manager holds");

const page = read("../app/(app)/reports/[id]/capture/page.tsx");
const form = read("../components/reports/site-capture-form.tsx");

check("it is called Site Capture", /Site Capture/.test(page));
check("it dictates with the one dictation component", /DictationField/.test(form));
check("and asks for the large control", /prominent/.test(form));
check("the box holds only the new capture", /defaultValue=""/.test(form));
check(
  "and is cleared only when a capture actually landed",
  /key=\{entryCount\}/.test(form),
  "a failed save must leave the words in the box",
);
check("photographs can be added here", /PhotoUpload/.test(page));
check("and the ones already taken are shown", /PhotoGrid/.test(page));
check("Continue later is offered", /Continue later/.test(page));
check("and so is finishing the report", /Finish the report/.test(page));
check("the day so far is available but not in the way", /<details/.test(page));
check("an issued report is sent to the document instead", /redirect\(`\/reports\/\$\{id\}`\)/.test(page));
check("the screen says nothing is replaced", /nothing is replaced/.test(page));

console.log("\n9. Where Site Capture is reached from");

const project = read("../app/(app)/projects/[id]/page.tsx");
const chooser = read("../app/(app)/reports/new/page.tsx");
const dashboard = read("../app/(app)/dashboard/page.tsx");
const report = read("../app/(app)/reports/[id]/page.tsx");

check("the project offers it", /action=\{openSiteCapture\}/.test(project) && /Site Capture/.test(project));
check("and no longer offers a second way to start today's report", !/startReport/.test(project));
check("picking a site opens today's report", /action=\{openSiteCapture\}/.test(chooser));
check("the dashboard leads with it", /label="Site Capture"/.test(dashboard));
check("and a draft report can go back to it", /\/capture`\}/.test(report));

console.log("\n10. The end of the day is unchanged");

check(
  "cleanup is told the source may be several entries across a day",
  /CAPTURED ACROSS A DAY/.test(CLEANUP_SYSTEM_PROMPT_HEAD),
);
check(
  "and told to consolidate them into one account",
  /Consolidate all of them/.test(CLEANUP_SYSTEM_PROMPT_HEAD),
);
check(
  "the capture time is never printed as an event time",
  /Never print it/.test(CLEANUP_SYSTEM_PROMPT_HEAD),
);
check(
  "but times said out loud are still facts",
  /are facts and are carried through exactly/.test(CLEANUP_SYSTEM_PROMPT_HEAD),
);
check("the source label mentions the entries", /several entries across one day/.test(CLEANUP_SOURCE_LABEL));

const cleanup = read("../lib/ai/cleanup-prompt.ts");
check(
  "and the Master AI Review is still a separate layer",
  /master-review-prompt/.test(cleanup) && !/master/i.test(CLEANUP_SYSTEM_PROMPT_HEAD.toLowerCase().replace(/master ai review/g, "")),
);

console.log("\n11. No migration, and no new table");

const migrations = read("../supabase/migrations/20260826000001_initial_schema.sql");
check("raw_notes is where the day is kept", /raw_notes text/.test(migrations));
check(
  "and report_sections could not have held it",
  /unique \(report_id, section_type\)/.test(migrations),
  "one row per section, so it has nowhere to put a fourth dictation",
);
// The real proof that this needed no migration: the newest one in the
// repository is still the photograph rotation column, and none of them
// mentions a capture table.
const migrationFiles = readdirSync(new URL("../supabase/migrations/", import.meta.url)).sort();
check(
  "no migration was added for Site Capture",
  migrationFiles[migrationFiles.length - 1] === "20260901000009_photo_rotation.sql",
  migrationFiles.join(", "),
);
check(
  "and no migration creates a table to hold captures",
  !migrationFiles.some((name) =>
    /create table[^\n;]*capture/i.test(
      readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
    ),
  ),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL SITE CAPTURE CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
