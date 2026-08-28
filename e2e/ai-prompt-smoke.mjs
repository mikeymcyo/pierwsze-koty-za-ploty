/**
 * Guards on what the drafting model is actually told.
 *
 * Prose quality cannot be asserted here - that needs a real model and a human
 * reading the result. What can be asserted is the contract around the prompt,
 * and it is the contract that broke: the first version introduced the notes as
 * "THE SITE MANAGER'S OWN WORDS (verbatim)" and asked for their meaning kept
 * "while fixing grammar and punctuation", so the model proofread them and
 * handed them back. These checks fail if that framing ever returns, if the
 * notes stop reaching the model verbatim, or if the ban on unsupported quality
 * claims is dropped.
 *
 * Needs no OpenAI key, no Supabase and no dev server:
 *
 *   npm run test:ai-prompt
 *
 * The pipeline itself - the API call, the JSON schema, the upsert - is
 * exercised by ai-smoke.mjs against the local stub.
 */

import {
  PHOTO_TAGS_LABEL,
  RAW_NOTES_LABEL,
  SYSTEM_PROMPT,
  buildPrompt,
} from "../lib/ai/prompt.ts";
import { REPORT_SECTIONS } from "../lib/report-sections.ts";
import { sectionsFor } from "./stub-openai.mjs";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

// The prompt is hard-wrapped, so a phrase can straddle a line break. Matching
// against a whitespace-flattened copy keeps these checks about what the model
// is told rather than about where the lines happen to end.
const flat = SYSTEM_PROMPT.replace(/\s+/g, " ").toLowerCase();

// Deliberately awkward: dictated punctuation, a line break, a trailing space,
// a non-ASCII character and a term that looks like a typo but is not.
const RAW_NOTES = `sign was put up with extra rods and chemical anchor plus, washers were added,
and area on side of building was re-plastered and repainted – 2no. coats `;

const INPUT = {
  projectName: "Lidl South Croydon - External Works",
  client: "Lidl GB",
  siteAddress: "South Croydon",
  reportDate: "2026-08-28",
  weather: "Dry, 18C",
  authorName: "Maciej",
  workforce: [{ company_name: "Empire Interiors", trade: "Plastering", operatives: 3 }],
  plant: [{ description: "Scissor lift", quantity: 1 }],
  photos: [{ category: "safety", caption: null }],
  rawNotes: RAW_NOTES,
};

console.log("\n1. The notes are handed over as raw material, not as text to correct");
check(
  "the label says raw material",
  /raw material/i.test(RAW_NOTES_LABEL),
  RAW_NOTES_LABEL,
);
check("the label says rewritten", /rewritten/i.test(RAW_NOTES_LABEL), RAW_NOTES_LABEL);
check(
  "the label says NOT to be corrected",
  /not text to be corrected/i.test(RAW_NOTES_LABEL),
  RAW_NOTES_LABEL,
);
check(
  "the old proofreading framing is gone",
  !/own words/i.test(RAW_NOTES_LABEL) && !/verbatim/i.test(RAW_NOTES_LABEL),
  RAW_NOTES_LABEL,
);

console.log("\n2. The notes reach the model verbatim");
const before = JSON.stringify(INPUT);
const prompt = buildPrompt(INPUT);

check("the notes appear exactly as given", prompt.includes(RAW_NOTES));
check(
  "they are the last thing in the prompt, directly under their label",
  prompt.endsWith(`${RAW_NOTES_LABEL}\n${RAW_NOTES}`),
  JSON.stringify(prompt.slice(-90)),
);
check("nothing trimmed the trailing space", prompt.endsWith(" "));
check("the line break survived", prompt.includes("added,\nand area"));
check("the en dash survived", prompt.includes("– 2no. coats"));
check("building the prompt does not mutate the input", JSON.stringify(INPUT) === before);

// The stub finds the notes by splitting on that label. It used to carry its
// own copy of the old wording, so rewording the prompt left it reading an
// empty string and the pipeline test passing on nothing.
check(
  "the stub can still find the notes in the prompt",
  sectionsFor(prompt).works_completed.includes("sign was put up"),
  sectionsFor(prompt).works_completed,
);

console.log("\n3. Photo tags are evidence of a photo, not of an event");
check("the label says so", /not evidence that an event occurred/i.test(PHOTO_TAGS_LABEL), PHOTO_TAGS_LABEL);
check("and the prompt uses it", prompt.includes(PHOTO_TAGS_LABEL));
check(
  "the system prompt repeats the rule",
  flat.includes("do not turn a photo tag into an event"),
);
check(
  "structured data must not become a claim about who did what",
  flat.includes("do not attribute work to a trade or a company unless the notes say so"),
);

console.log("\n4. The system prompt commissions a rewrite, not a proofread");
check("it says REWRITE", SYSTEM_PROMPT.includes("REWRITE"));
check("it says it is not proofreading", flat.includes("not proofreading"));
check("it forbids working sentence by sentence", flat.includes("sentence by sentence"));
check("it asks for consolidation", flat.includes("consolidate"));
check("it names the register as something to change", flat.includes("register"));
check(
  "it asks for UK construction terminology",
  flat.includes("making good") && flat.includes("reinstatement"),
);
check(
  "the instruction that caused the literal output is gone",
  !/fixing grammar and punctuation/i.test(SYSTEM_PROMPT),
  "the proofreading rule is back in the prompt",
);

console.log("\n5. Facts, and unsupported quality claims, are still forbidden");
for (const rule of [
  "quantities, dimensions, areas, durations or times",
  "causes, reasons, fault or responsibility",
  "inspections, tests, sign-offs, approvals or instructions",
  "health and safety events, briefings, or the absence of them",
]) {
  check(`it forbids inventing ${rule.split(",")[0]}`, flat.includes(rule), rule);
}

// The words the owner ruled out: each asserts something the notes cannot
// support, and each is the word a dispute would turn on.
for (const banned of [
  "secure",
  "watertight",
  "compliant",
  "to specification",
  "correctly installed",
  "satisfactory",
  "satisfactorily completed",
  "approved",
  "inspected",
  "certified",
  "tested",
  "safe",
  "suitable",
  "complete in accordance with requirements",
]) {
  check(`"${banned}" is on the banned list`, flat.includes(banned));
}

check(
  "the ban is conditional on the source data, not absolute",
  flat.includes("unless the source data says so explicitly"),
);
check(
  "neutral presentation wording is still allowed",
  flat.includes("to provide a consistent finished appearance") &&
    flat.includes("neutral phrases describing presentation or process are allowed"),
);
check("ambiguity resolves conservatively", flat.includes("write the conservative"));
check(
  "an empty section is still a correct answer",
  flat.includes("an empty section is a correct answer"),
);

console.log("\n6. Section briefs do not ask for claims of their own");
const safety = REPORT_SECTIONS.find((section) => section.type === "health_safety");
check(
  "health and safety no longer asks the model to state nothing was reported",
  !/say nothing was reported/i.test(safety.brief),
  safety.brief,
);
check(
  "it says silence is not the same as a nil return",
  /silence is not the same/i.test(safety.brief),
  safety.brief,
);
check(
  "no brief instructs the model to invent",
  REPORT_SECTIONS.every((section) => !/\binvent(?!ing an event)/i.test(section.brief)),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL AI PROMPT CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
