/**
 * What the image model is told, and what it is structurally unable to do.
 *
 * A photograph is the most dangerous input in this product: the model is
 * looking at pixels, and everything it might say about compliance, completion,
 * cause or quality would be invented from an image that cannot carry those
 * facts. Needs neither a key nor a network.
 */
import { readFileSync } from "node:fs";

import {
  PHOTO_DESCRIPTION_SYSTEM_PROMPT,
  buildPhotoDescriptionPrompt,
} from "../lib/ai/photo-prompt.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. The model may describe only what is there");
check(
  "it is limited to the visible and the supplied",
  /what is plainly visible/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT) &&
    /facts given to you in the context/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);
check(
  "a supplied location may be used",
  /rear loading bay/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);
check(
  "an unsupplied one may not",
  /do not place the photograph anywhere/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);

console.log("\n2. Every claim the owner listed is forbidden");
for (const [what, pattern] of [
  ["completion", /complete, completed, finished or\s+installed/i],
  ["compliance", /compliant/i],
  ["approval", /approved/i],
  ["certification", /certified/i],
  ["successful testing", /tested/i],
  ["inspection", /inspected/i],
  ["dimensions", /dimensions, quantities, areas/i],
  ["unidentifiable materials", /a material or product you cannot plainly\s+identify/i],
  ["unsupplied location", /a location, level, room, plot or elevation not given/i],
  ["cause of a defect", /the cause of a defect/i],
  ["responsibility", /who is responsible, or who is at\s+fault/i],
  ["unsupplied dates", /when the work was done, beyond a date\s+supplied/i],
  ["installation quality", /judgement of workmanship or\s+quality/i],
]) {
  check(`${what} is forbidden`, pattern.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT));
}

console.log("\n3. The owner's own example is in the prompt");
check(
  "the bad caption is shown as bad",
  PHOTO_DESCRIPTION_SYSTEM_PROMPT.includes("Completed compliant fire stopping installation."),
);
check(
  "and the better one as better",
  /Fire-stopping material visible around service penetrations/.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);
check(
  "describing less is preferred to guessing",
  /Describe less/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT) &&
    /Never guess to fill a\s+sentence/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);
check(
  "and absence is not a thing a photograph can show",
  /never say that something is\s+absent/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);
check(
  "the answer is one short sentence for a UK report",
  /one sentence/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT) &&
    /British English/i.test(PHOTO_DESCRIPTION_SYSTEM_PROMPT),
);

console.log("\n4. The context handed over is the safe context only");
const full = buildPhotoDescriptionPrompt({
  projectName: "Lidl South Croydon",
  client: "Lidl GB",
  siteAddress: "South Croydon",
  reportDate: "2026-01-05",
  statusLabel: "Defect",
  existingCaption: "Cracked kerb by the gate",
  reportContext: "kerbs laid to the entrance",
});
check("the project is named", full.includes("Lidl South Croydon"));
check("the status chosen on site is named", full.includes("Defect"));
check("the date is named", full.includes("2026-01-05"));
check(
  "the user's caption is labelled as theirs and protected",
  /THE SITE MANAGER'S OWN CAPTION/.test(full) && /never contradict it/i.test(full),
);
check(
  "the day's notes are labelled as context, not as what the photo shows",
  /do not assume the photograph shows any of it/i.test(full),
);

const bare = buildPhotoDescriptionPrompt({
  projectName: "Lidl South Croydon",
  client: null,
  siteAddress: null,
  reportDate: null,
  statusLabel: null,
  existingCaption: null,
  reportContext: null,
});
check("a photograph with no caption says so plainly", /HAS NOT WRITTEN A CAPTION/.test(bare));
check("and no context says so too", /NO FURTHER SITE CONTEXT/.test(bare));
check("nothing missing is printed as null", !/null/i.test(bare), bare);

console.log("\n5. The suggestion cannot overwrite anything by itself");
const actions = readFileSync(new URL("../app/(app)/reports/photo-actions.ts", import.meta.url), "utf8");
const describeBody = actions.slice(actions.indexOf("export async function describePhotoAction"));
check(
  "describePhotoAction writes nothing to the database",
  !/\.update\(/.test(describeBody) && !/\.insert\(/.test(describeBody) && !/\.delete\(/.test(describeBody),
);
check(
  "it returns a description for the user to accept",
  /description: result\.description/.test(describeBody),
);
check(
  "and the caption is only ever written by the save action",
  /\.update\(\{ caption:/.test(actions.slice(actions.indexOf("export async function savePhotoDetails"))),
);

const ui = readFileSync(new URL("../components/reports/photo-details.tsx", import.meta.url), "utf8");
// A suggestion still reaches the caption box only on Use it - what changed is
// that accepting it now also keeps it. There is no Save button under a
// photograph any more: a caption typed and scrolled past was a caption lost.
check(
  "the suggestion reaches the caption box only when the user presses Use it",
  /setText\(showing\);\s*\n\s*setDismissed\(true\);/.test(ui) &&
    // Nothing else writes it. The suggestion is never applied on arrival.
    !/useEffect\([^)]*setText\(suggestion/.test(ui),
);
check(
  "accepting a suggestion saves it, without a second press",
  /setFlush\(\(count\) => count \+ 1\);/.test(ui) && !/Save<\/Button>/.test(ui),
);
check(
  "the panel says so rather than promising a Save button that no longer exists",
  /Accepting it saves it/.test(ui) && !/Nothing is saved until you press Save/.test(ui),
);
check(
  "a caption saves itself when typing stops and when the box is left",
  /setTimeout\(submit/.test(ui) && /onBlur=\{submit\}/.test(ui),
);
check(
  "and a save that would change nothing is not sent",
  /if \(text === savedRef\.current\.text && status === savedRef\.current\.status\) return;/.test(ui),
);

console.log("\n6. A consolidated report can describe its plates too");

// A Completion or Progress Report that consolidates issued Daily Reports
// captions its plates in the curation form - summary_report_photos.
// caption_override - and that is the only place those words are written. It
// was the one description box in the application with no help behind it.
const curation = readFileSync(
  new URL("../components/summary-reports/summary-curation.tsx", import.meta.url),
  "utf8",
);
check(
  "the button is offered under the description box",
  /Describe with AI/.test(curation) && /describePhotoAction/.test(curation),
);
check(
  "it is a button rather than a nested form, which is not legal inside the curation form",
  /type="button"[\s\S]{0,200}?onClick=\{draft\}/.test(curation),
);
check(
  "the sentence lands in the box the user is looking at",
  /if \(result\.description\) onChange\(result\.description\);/.test(curation),
);
check(
  "so it can be corrected before it is saved",
  /<PhotoDescriptionField[\s\S]{0,220}?value=\{value\}[\s\S]{0,120}?onChange=\{onChange\}/.test(curation),
);
check(
  "editing it marks the form unsaved, as typing always did",
  /onChange=\{\(text\) => \{\s*\n\s*setDirty\(true\);/.test(curation),
);
check(
  "nothing is written until Save selection is pressed",
  /Save selection/.test(curation) && !/savePhotoDetails/.test(curation),
);
check(
  "and the button is hidden with no key configured",
  /aiConfigured \? \(/.test(curation),
);
// The photograph's own caption belongs to the Daily Report it came from.
check(
  "a description written here does not rewrite the photograph's own caption",
  /name=\{`photoCaption_\$\{photoId\}`\}/.test(curation),
);
check(
  "a failure says so in the tile rather than silently doing nothing",
  /text-xs text-danger/.test(curation),
);


console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PHOTO AI CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
