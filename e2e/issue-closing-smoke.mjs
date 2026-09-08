/**
 * Closing an issue, and how issues sit on a page.
 *
 * Both guard bugs found on a real iPad.
 *
 * The first: closing an issue printed "Invalid input: expected string, received
 * undefined" under the Resolution box. The form sent the field; updateIssue
 * never read it; the schema reported exactly what it saw. Nobody could close an
 * issue, and the message told them nothing.
 *
 * The second: a one-line issue could occupy most of a page on its own, because
 * the photographs section that followed it forced a page break.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  ISSUE_STATUS_LABELS,
  closedAtFor,
  hasRequiredResolution,
  isResolvedStatus,
  parseResolutionSuggestions,
  resolutionSuggestionsParam,
} from "../lib/issues/metadata.ts";
import {
  GENERIC_FIELD_MESSAGE,
  RESOLUTION_REQUIRED,
  fieldErrorsFrom,
  isInternalMessage,
  userFacingMessage,
} from "../lib/issues/validation.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const actions = readFileSync(new URL("../app/(app)/issues/actions.ts", import.meta.url), "utf8");
const updateBody = actions.slice(
  actions.indexOf("export async function updateIssue"),
  actions.indexOf("export async function setIssueStatus"),
);

console.log("\n1. The root cause: the resolution field is actually read");
check(
  "updateIssue reads resolution from the form",
  /resolution: read\(formData, "resolution"\)/.test(updateBody),
);
check(
  "and every other field the form sends is read too",
  ["title", "description", "responsible", "photoId", "priority", "status"].every((field) =>
    new RegExp(`${field}: read\\(formData, "`).test(updateBody),
  ),
);
check(
  "the form does send it",
  /name="resolution"/.test(
    readFileSync(new URL("../components/issues/issue-form.tsx", import.meta.url), "utf8"),
  ),
);

console.log("\n2. An open issue saves with no resolution");
check("open needs nothing recorded", hasRequiredResolution("open", null));
check("nor does in progress", hasRequiredResolution("in_progress", null));
check("an empty string is the same as nothing", hasRequiredResolution("open", "   "));
check("closed_at stays empty while it is open", closedAtFor("open", null) === null);

console.log("\n3. Closing requires a resolution, and says so in English");
check("closing with nothing recorded is refused", !hasRequiredResolution("closed", null));
check("and whitespace does not count", !hasRequiredResolution("closed", "   \n "));
check("closing with a resolution is allowed", hasRequiredResolution("closed", "Cable diverted by the electrician."));
check(
  "the message is the one a site manager can act on",
  RESOLUTION_REQUIRED === "Add a resolution before closing this issue.",
  RESOLUTION_REQUIRED,
);
check(
  "and it is what the schema raises",
  /message: RESOLUTION_REQUIRED/.test(actions),
);
check(
  "it is not a validator sentence itself",
  !isInternalMessage(RESOLUTION_REQUIRED),
);

console.log("\n4. No validator vocabulary can reach the screen");
for (const raw of [
  "Invalid input: expected string, received undefined",
  "Expected string, received null",
  "Required",
  "invalid_type",
  "String must contain at least 3 character(s)",
  "   ",
]) {
  check(`"${raw.trim() || "(blank)"}" is replaced`, userFacingMessage(raw) === GENERIC_FIELD_MESSAGE);
}
for (const written of [
  "Add a resolution before closing this issue.",
  "Say what the issue is",
  "Choose a priority",
  "Pick a valid photo",
]) {
  check(`"${written}" is shown as written`, userFacingMessage(written) === written);
}
check(
  "the action routes its field errors through the sanitiser",
  /return fieldErrorsFrom\(error\.issues\)/.test(actions),
);
const sanitised = fieldErrorsFrom([
  { path: ["resolution"], message: "Invalid input: expected string, received undefined" },
  { path: ["title"], message: "Say what the issue is" },
  { path: ["resolution"], message: "a later one for the same field" },
]);
check("a raw message becomes the generic one", sanitised.resolution === GENERIC_FIELD_MESSAGE);
check("a written message survives", sanitised.title === "Say what the issue is");
check("only the first error per field is kept", Object.keys(sanitised).length === 2);

console.log("\n5. What gets saved, and what history records");
check(
  "the resolution is persisted rather than discarded",
  /resolution: input\.resolution,/.test(updateBody),
);
check(
  "it is no longer thrown away for a non-closed status",
  !/input\.status === "closed" \? input\.resolution : null/.test(updateBody),
);
check("the status is persisted", /status: input\.status,/.test(updateBody));
check("closed_at is derived from the status", /closed_at: closedAtFor\(input\.status/.test(updateBody));
check("closing stamps a time", typeof closedAtFor("closed", null) === "string");
check("reopening clears it", closedAtFor("open", "2026-01-05T00:00:00Z") === null);
check(
  "an existing closed_at is not overwritten on a re-save",
  closedAtFor("closed", "2026-01-05T00:00:00Z") === "2026-01-05T00:00:00Z",
);
check(
  "history is left to the database trigger, not bypassed",
  /create trigger issues_record_event/.test(
    readFileSync(
      new URL("../supabase/migrations/20260828000005_summary_reports.sql", import.meta.url),
      "utf8",
    ),
  ) && !/issue_events/.test(actions),
);

console.log("\n6. An optional field tolerates the key being missing");
check(
  "optional text accepts undefined rather than reporting on it",
  /z\s*\.union\(\[\s*z\.string\(\),\s*z\.undefined\(\),\s*z\.null\(\)\s*\]\)/.test(actions),
);
check(
  "and there are no bare z.string() optional fields left to trip over",
  !/const optionalText = z\s*\n\s*\.string\(\)/.test(actions),
);

console.log("\n7. Issues no longer own a page each");
// The layout itself moved into lib/pdf/components.tsx with the shared template
// - see e2e/pdf-template-smoke.mjs, which renders real pages and counts them.
// What is guarded here is only the rule this bug produced: nothing forces a
// page break, and only a single card is ever pinned together.
const daily = readFileSync(new URL("../lib/pdf/report-document.tsx", import.meta.url), "utf8");
const summary = readFileSync(new URL("../lib/pdf/summary-document.tsx", import.meta.url), "utf8");
const parts = readFileSync(new URL("../lib/pdf/components.tsx", import.meta.url), "utf8");
for (const [name, source] of [["daily", daily], ["consolidated", summary], ["shared parts", parts]]) {
  check(`${name}: nothing forces a page break any more`, !/<View break>/.test(source));
  check(
    `${name}: whole sections no longer jump a page to stay intact`,
    !/<View key=\{section\.type\} wrap=\{false\}>/.test(source),
  );
}
check(
  "an issue card is still kept together",
  /style=\{\[s\.issue[^\]]*\]\} wrap=\{false\}/.test(parts),
);
check("a photograph keeps its caption", /style=\{s\.photoCell\} wrap=\{false\}/.test(parts));
check(
  "headings reserve room so they are not stranded at the foot of a page",
  /minPresenceAhead=\{reserve\}/.test(parts),
);
check(
  "the daily report explains why the break went",
  /Forcing one here ended whatever preceded it/.test(daily),
);

console.log("\n9. Resolved: the word, the one-tap route, and a suggestion that never acts alone");
check("a closed issue is called Resolved on screen and on the page", ISSUE_STATUS_LABELS.closed === "Resolved");
check("and the stored value is still closed", isResolvedStatus("closed") && !isResolvedStatus("open") && !isResolvedStatus("in_progress"));
const resolveBody = actions.slice(actions.indexOf("export async function resolveIssue"));
check("marking resolved records the note as the resolution", /resolution: parsed\.data\.note,/.test(resolveBody));
check("and stamps the resolved date the same way closing does", /closed_at: closedAtFor\("closed", existing\.closed_at\)/.test(resolveBody));
check("an empty note is refused", /min\(1, "Say what was done"\)/.test(actions));
check("the list offers Mark resolved in place of a trip to the edit form", /<ResolveIssue/.test(readFileSync(new URL("../components/issues/issue-list.tsx", import.meta.url), "utf8")) && !/Resolve and close/.test(readFileSync(new URL("../components/issues/issue-list.tsx", import.meta.url), "utf8")));
const prepare = readFileSync(new URL("../app/(app)/reports/prepare-actions.ts", import.meta.url), "utf8");
check("Prepare Daily asks whether the notes resolved an open issue", /suggestResolvedIssues\(/.test(prepare));
check("and only carries the answer to the screen - it never writes an issue", !/from\("issues"\)[\s\S]{0,400}\.update\(/.test(prepare) && !/resolveIssue|setIssueStatus/.test(prepare));
check("a failure there never spoils the Daily", /catch \(cause\)[\s\S]{0,120}resolution suggestion skipped/.test(prepare));
const control = readFileSync(new URL("../components/issues/resolve-issue.tsx", import.meta.url), "utf8");
check("the suggestion asks, and the person confirms", /Resolve this issue\?/.test(control) && /Confirm resolved/.test(control) && /Leave it open/.test(control));
const ai = readFileSync(new URL("../lib/ai/issue-resolution.ts", import.meta.url), "utf8");
check("the reader is told waiting is not resolution and doubt returns nothing", /NOT resolution/.test(ai) && /Return an empty list rather than guess/.test(ai));
check("and it keeps only ids it was given", /offered\.has\(item\.issueId\)/.test(ai));
const good = [{ issueId: "0b4c2b7d-6eb7-4edb-a3f0-a070d431aee4", note: "Inserts arrived Monday; section completed." }];
const round = parseResolutionSuggestions(decodeURIComponent(resolutionSuggestionsParam(good)));
check("a suggestion round-trips through the URL", round.length === 1 && round[0].issueId === good[0].issueId && round[0].note === good[0].note);
check("junk in the URL is nothing", parseResolutionSuggestions("not json").length === 0 && parseResolutionSuggestions('{"a":1}').length === 0 && parseResolutionSuggestions(null).length === 0);
check("an id that is not an id is dropped", parseResolutionSuggestions('[{"issueId":"../etc","note":"x"}]').length === 0);
check("a note is capped and a duplicate id kept once", parseResolutionSuggestions(JSON.stringify([{ issueId: good[0].issueId, note: "x".repeat(400) }, { issueId: good[0].issueId, note: "again" }]))[0].note.length === 200 && parseResolutionSuggestions(JSON.stringify([good[0], good[0]])).length === 1);
const page = readFileSync(new URL("../app/(app)/reports/[id]/page.tsx", import.meta.url), "utf8");
check("the screen offers a suggestion only for an open issue on this report", /parseResolutionSuggestions\(resolve\)\.filter/.test(page) && /!isResolvedStatus\(issue\.status\)/.test(page));
const pdfData = readFileSync(new URL("../lib/summary-reports/pdf-data.ts", import.meta.url), "utf8");
check("a draft Progress or Completion prints the issue as it stands today", /report\.status === "final" \? \(link\.status_at_issue \?\? issue\.status\) : issue\.status/.test(pdfData));
check("the consolidator is told a resolved issue is not outstanding", /is not outstanding: never list it under outstanding/.test(readFileSync(new URL("../lib/ai/summary-prompt.ts", import.meta.url), "utf8")));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL ISSUE CLOSING CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
