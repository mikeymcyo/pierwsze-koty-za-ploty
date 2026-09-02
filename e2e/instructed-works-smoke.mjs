/**
 * The instructed works table, measured against the Northfleet report.
 *
 * The gold standard is a real completion report for Lidl GB RDC Northfleet:
 * eight numbered instructed items, each with the works carried out, the plates
 * that evidence it and a status. This asserts the shape SiteBoss now produces
 * can carry that document, and - more importantly - that it cannot produce the
 * two things that would make it worthless: a citation to a photograph that
 * does not exist, and a completion claimed from silence.
 *
 *   npm run test:instructed-works
 */

import { readFileSync } from "node:fs";

import {
  DEFAULT_STATUS,
  INSTRUCTED_WORK_STATUSES,
  parseInstructedWorks,
  plateCell,
  sanitiseRows,
  serialiseInstructedWorks,
  supportedStatus,
} from "../lib/summary-reports/instructed-works.ts";
import {
  knownPlates,
  photoManifest,
  photoReference,
  plateReferencesIn,
  stripUnknownPlates,
} from "../lib/pdf/photo-evidence.ts";
import {
  INSTRUCTED_WORKS_SYSTEM_PROMPT,
  buildInstructedWorksPrompt,
} from "../lib/ai/instructed-works-prompt.ts";
import { SITE_MANAGER_TONE } from "../lib/ai/tone.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
/**
 * A prompt with its line wrapping flattened.
 *
 * What the model reads is the sentence, not where the array split it. Matching
 * the wrapped source makes a reflow break a check about wording, which is how
 * checks about wording get loosened.
 */
const flat = (source) => source.replace(/\s+/g, " ");
const promptText = flat(INSTRUCTED_WORKS_SYSTEM_PROMPT);
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

// The eight instructed items from the client's External Walk of 21 July 2026,
// as the Northfleet report tabulates them.
const NORTHFLEET = [
  { instruction: "Damaged concrete", location: "Bay 15 (goods-in driver door)", worksCarriedOut: "Break out and patch repair, QC6", plateRefs: ["P15"], status: "Complete" },
  { instruction: "Damaged concrete", location: "Bay 19", worksCarriedOut: "Break out and patch repair, QC6", plateRefs: ["P16"], status: "Complete" },
  { instruction: "Damaged concrete", location: "Bay 23", worksCarriedOut: "Break out and patch repair, QC6", plateRefs: ["P17"], status: "Complete" },
  { instruction: "Repair concrete", location: "Bay 31 (speed ramp)", worksCarriedOut: "Break out and patch repair, QC6", plateRefs: [], status: "Complete" },
  { instruction: "Repair concrete", location: "Bay 32", worksCarriedOut: "Break out and patch repair, QC6", plateRefs: ["P18"], status: "Complete" },
  { instruction: "Repair concrete around drain", location: "Bay 33 (drain)", worksCarriedOut: "Localised break out and reinstatement around gully, QC6", plateRefs: ["P19", "P20"], status: "Complete" },
  { instruction: "Repair damaged concrete around drain", location: "Bay 39 (drain)", worksCarriedOut: "Full chamber rebuild", plateRefs: ["P01", "P13"], status: "Complete" },
  { instruction: "Replace damaged tarmac", location: "Bay 37", worksCarriedOut: "Cut out and patch repair, UltraCrete HAPAS tarmac", plateRefs: ["P21"], status: "Complete" },
];

console.log("\n1. The shape carries the gold standard");

const stored = serialiseInstructedWorks(sanitiseRows(NORTHFLEET, 21));
const back = parseInstructedWorks(stored);
check("all eight instructed items survive a round trip", back?.length === 8);
check("in the instruction's own order", back?.[0].location === "Bay 15 (goods-in driver door)" && back?.[7].location === "Bay 37");
check("the works column keeps its materials and method", /UltraCrete HAPAS tarmac/.test(back?.[7].worksCarriedOut ?? ""));
check("bay 31, evidenced by no photograph, still reads Complete", back?.[3].status === "Complete" && back?.[3].plateRefs.length === 0, "the record said the work was done; the missing plate is not a doubt about it");
check("its photo cell is an em dash, not an empty cell", plateCell(back?.[3].plateRefs ?? []) === "—");
check("a multi-plate row prints both", plateCell(back?.[5].plateRefs ?? []) === "P19, P20");
check("the four statuses are the four agreed", INSTRUCTED_WORK_STATUSES.join("|") === "Complete|Partially complete|Not confirmed|Not carried out");

console.log("\n2. No invented completion: silence is Not confirmed");

check("the default for silence is Not confirmed", DEFAULT_STATUS === "Not confirmed");
check(
  "Complete with nothing in the works column falls back",
  supportedStatus({ worksCarriedOut: "", status: "Complete" }) === "Not confirmed",
  "a completion nobody recorded is a completion nobody can stand behind",
);
check("so does Partially complete", supportedStatus({ worksCarriedOut: "   ", status: "Partially complete" }) === "Not confirmed");
check(
  "but Not carried out survives an empty works column",
  supportedStatus({ worksCarriedOut: "", status: "Not carried out" }) === "Not carried out",
  "somebody said the work was not done; that is the answer, not a gap",
);
check("and a real works entry keeps its status", supportedStatus({ worksCarriedOut: "Broken out and reinstated in QC6", status: "Complete" }) === "Complete");
check(
  "the prompt forbids inferring Not carried out from missing evidence",
  /Never infer it from missing evidence/.test(promptText) &&
    /Not confirmed[\s\S]{0,200}does NOT mean the work was skipped/.test(promptText),
);
check("and forbids a blanket 'works were completed as instructed'", /works were completed as instructed/.test(promptText));

console.log("\n3. Photo traceability: a citation resolves, or it goes");

const labels = [
  { caption: "Bay 39 - chamber and surrounding slab prior to works.", status: "Before" },
  { caption: "Bay 39 - removal of crumbled concrete around the chamber.", status: "During" },
  { caption: null, status: null },
];
const manifest = photoManifest(labels);
check("the manifest numbers exactly as the plates print", manifest.startsWith("P01 |") && manifest.includes("\nP02 |") && manifest.includes("\nP03 |"));
check("it uses the same function the PDF numbers with", photoReference(0) === "P01" && photoReference(12) === "P13");
check("a chosen stage is shown", /P01 \| BEFORE \|/.test(manifest));
check("an unset stage is a dash, never an invented BEFORE", /P03 \| — \| no caption/.test(manifest), "stage is only ever what somebody chose");
check("an uncaptioned photograph still gets a line", manifest.split("\n").length === 3);

check("plates that exist are known", knownPlates(21).has("P21") && !knownPlates(21).has("P22"));
check(
  "a citation to a plate that does not exist is removed from prose",
  stripUnknownPlates("Chamber rebuilt to sound base (P22).", 21) === "Chamber rebuilt to sound base.",
);
check(
  "the surrounding claim is kept",
  /Chamber rebuilt to sound base/.test(stripUnknownPlates("Chamber rebuilt to sound base (P22).", 21)),
  "the citation was wrong; the fact may still be sound",
);
check(
  "a mixed citation keeps the real plate and drops the invented one",
  stripUnknownPlates("Reinstated flush (P15, P99).", 21) === "Reinstated flush (P15).",
);
check("a good citation is untouched", stripUnknownPlates("Reinstated flush (P15-P20).", 21) === "Reinstated flush (P15-P20).");
check("a bare invented reference goes too", !/P44/.test(stripUnknownPlates("Slab broken out P44 around the chamber.", 21)));
check("plateReferencesIn finds them", plateReferencesIn("(P01, P03) and P13").join(",") === "P01,P03,P13");

check(
  "a row citing a plate that does not exist loses the citation, not the row",
  (() => {
    const [row] = sanitiseRows([{ ...NORTHFLEET[0], plateRefs: ["P15", "P99"] }], 21);
    return row.plateRefs.join(",") === "P15" && row.status === "Complete";
  })(),
);
check(
  "duplicate and out-of-order citations are tidied",
  sanitiseRows([{ ...NORTHFLEET[5], plateRefs: ["P20", "P19", "P20"] }], 21)[0].plateRefs.join(",") === "P19,P20",
);
check("with no photographs at all, every citation goes", sanitiseRows([{ ...NORTHFLEET[0], plateRefs: ["P15"] }], 0)[0].plateRefs.length === 0);

console.log("\n4. Instruction mapping: one row per instructed item");

const prompt = buildInstructedWorksPrompt({
  projectName: "Lidl GB RDC Northfleet",
  client: "Lidl GB",
  instruction: "- Repair damaged concrete around drain, bay 39\n- Replace damaged tarmac, bay 37",
  evidence: "Chamber at bay 39 rebuilt in engineering bricks and reinstated in QC6.",
  photographs: manifest,
});
check("the instruction leads the prompt", prompt.indexOf("THE INSTRUCTION") < prompt.indexOf("THE SITE RECORD"));
check("the photographs are last, and cite-only", /Cite only these/.test(prompt) && prompt.lastIndexOf("P01 |") > prompt.indexOf("THE SITE RECORD"));
check("with no photographs the model is told the lists must be empty", /Every plateRefs list must be empty/.test(buildInstructedWorksPrompt({ projectName: "x", client: null, instruction: "- a", evidence: "b", photographs: null })));
check("one row per instructed item, in order", /One row per instructed item, in the order the instruction lists them/.test(promptText));
check("never merge or invent rows", /never merge two instructed items/.test(promptText) && /never invent a row the instruction does not contain/.test(promptText));
check("a location is never guessed from the order of the list", /Never guess a location from the order of the list/.test(promptText));
check("a plate may only be cited against the item it shows", /A plate cited against the wrong item is a false statement/.test(promptText));

console.log("\n5. No duplication: the table is not prose, and prose is not the table");

const sections = read("../lib/summary-reports/sections.ts");
const structure = read("../lib/report-structure.ts");
const action = read("../app/(app)/summary-reports/ai-actions.ts");
check("instructed_works is a section the document can hold", /type: "instructed_works"/.test(sections));
check("but is never asked of the prose pass", !/COMPLETION_DRAFTED_TYPES[\s\S]{0,120}instructed_works/.test(sections));
check("it has its own pass", /generateInstructedWorks\(/.test(action));
check("run only for Completion Reports", /report\.kind === "completion" && instructedItems\.length > 0/.test(action));
check("and only where the paperwork actually instructs something", /commitment === "instructed"/.test(action));
check("it prints above the prose about the work", structure.indexOf('"instructed_works"') < structure.indexOf('"completed_works"'));
check("a failed table does not cost the client the prose", /table\.ok && table\.rows\.length > 0/.test(action) && /console\.error\("\[siteboss\] instructed works table skipped/.test(action));
check("prose sections have their citations checked too", /stripUnknownPlates\(content, plateCount\)/.test(action));
check("but the table's JSON is not run through the prose stripper", /if \(type === "instructed_works"\) continue;/.test(action));
check("the table survives the stale-section sweep", /const drafted = Object\.keys\(sections\)/.test(action));

console.log("\n6. What the document does with it");

const pdf = read("../lib/pdf/summary-document.tsx");
const components = read("../lib/pdf/components.tsx");
check("the PDF pulls the table out of the prose", /parseInstructedWorks\(instructedEntry\?\.content\)/.test(pdf));
check("and renders the rest as prose", /<GroupedProse s=\{s\} group=\{group\} entries=\{prose\} \/>/.test(pdf));
check("the table has the five agreed columns", /Instruction/.test(components) && /Works carried out/.test(components) && /"Photo"/.test(components) && /"Status"/.test(components) && /"Location"/.test(components));
check("it reuses the one table primitive", /<DataTable/.test(components.slice(components.indexOf("InstructedWorksTable"))));
check("an unparseable section prints nothing rather than braces", parseInstructedWorks("Some prose somebody typed") === null && parseInstructedWorks(null) === null && parseInstructedWorks("{}") === null);
check("Not confirmed carries its meaning under the table", /This is not a statement that the work was\s*\n?\s*not carried out/.test(components));

console.log("\n7. Tone: a site manager, not an academic paper");

// The assembled text the model reads, not the source that builds it.
const tone = flat(SITE_MANAGER_TONE);
check("plain British construction English, short and direct", /plain British construction English, short and direct/.test(tone));
check("named as not an academic paper or a legal submission", /Not an academic paper, not a legal submission/.test(tone));
check("legalese is banned by example", /for the avoidance of doubt/.test(tone) && /insofar as/.test(tone) && /the aforementioned/.test(tone));
check("so is corporate filler", /robust/.test(tone) && /comprehensive/.test(tone) && /utilised/.test(tone));
check("plain is not vague, and the prompt says so", /Plain does not mean vague/.test(tone));
check(
  "and every layer that writes prose is given the same wording",
  ["../lib/ai/prompt.ts", "../lib/ai/summary-prompt.ts", "../lib/ai/instructed-works-prompt.ts"].every(
    (path) => /SITE_MANAGER_TONE/.test(read(path)),
  ),
  "one tone, asserted once, rather than three that drift apart",
);

console.log("\n8. Daily Reports are untouched");

check("no instructed-works anything in the daily prompt", !/instructed_works|plateRefs/.test(read("../lib/ai/prompt.ts")));
check("no daily action change", !/instructedItems|generateInstructedWorks/.test(read("../app/(app)/reports/ai-actions.ts")));
check("the daily document does not render the table", !/InstructedWorksTable/.test(read("../lib/pdf/report-document.tsx")));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL INSTRUCTED WORKS CHECKS PASSED");
else { for (const f of failures) console.log(`FAILED: ${f}`); process.exitCode = 1; }
