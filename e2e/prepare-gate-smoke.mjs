/**
 * Prepare Daily asks only what decides whether the report is true.
 *
 * Two failures this guards against, and they pull in opposite directions: a
 * draft written from nothing, and a worker quizzed about plant they never
 * used. Workforce and plant are never asked for. At most two questions. With
 * enough said, no questions at all.
 *
 *   npm run test:prepare-gate
 */

import { readFileSync } from "node:fs";

import {
  MAX_QUESTIONS,
  prepareQuestions,
  scopeMentioned,
  shortScope,
  significantWords,
} from "../lib/reports/prepare-gate.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const SCOPE = [
  "Repair the leaking bakery sink, including replacement of the trap and waste connection",
  "Rectify the warehouse doors so that both leaves close and latch correctly",
];

console.log("\n1. Enough said: no questions, draft now");

check("a day's notes that touch the job ask nothing", prepareQuestions({ notes: ["Renewed the trap on the bakery sink, tested, no leaks."], photoCount: 0, instructedScope: SCOPE }).length === 0);
check("'sorted the doors' counts as touching the job", scopeMentioned(["Sorted the doors, bottom guide was worn"], SCOPE));
check("with no paperwork read, notes alone are enough", prepareQuestions({ notes: ["Cleared the yard."], photoCount: 0, instructedScope: [] }).length === 0);
check("photos plus notes ask nothing extra", prepareQuestions({ notes: ["Sink done."], photoCount: 6, instructedScope: SCOPE }).length === 0);

console.log("\n2. Nothing said: the one question there is");

const silent = prepareQuestions({ notes: [], photoCount: 0, instructedScope: SCOPE });
check("nothing said, nothing shown: one question", silent.length === 1 && silent[0].id === "nothing_said");
check("answered with the microphone", silent[0].answerBy === "speak");
const photosOnly = prepareQuestions({ notes: ["   "], photoCount: 4, instructedScope: SCOPE });
check("photos in but nothing said: one question, and it says the photos are in", photosOnly.length === 1 && /Photos are in/.test(photosOnly[0].text));
check("and the scope question is not asked on top of it", !photosOnly.some((q) => q.id === "scope_not_mentioned"), "with nothing said, that would be the same question twice");

console.log("\n3. Said something, but not about the job");

const offTopic = prepareQuestions({ notes: ["Delivery of plasterboard arrived 10am, stacked in the yard."], photoCount: 2, instructedScope: SCOPE });
check("one question, naming what the paperwork asks for", offTopic.length === 1 && offTopic[0].id === "scope_not_mentioned");
check("it names the items", /bakery sink/.test(offTopic[0].text) && /warehouse doors/.test(offTopic[0].text));
check("and offers the honest way out", /If not, say so and the report will say so/.test(offTopic[0].text));
check("shortScope keeps a question to a phone's width", shortScope(SCOPE[0]).length <= 60 && shortScope("Fix the tap") === "Fix the tap");

console.log("\n4. Never more than two, never about workforce or plant");

check("the ceiling is two", MAX_QUESTIONS === 2);
const source = read("../lib/reports/prepare-gate.ts");
check("no question mentions workforce, operatives or plant", !/workforce|operative|plant\b/i.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").match(/text:[\s\S]*?,\n/g)?.join("") ?? ""));
check("the questions are typed to the two there are", /"nothing_said" \| "scope_not_mentioned"/.test(source));

console.log("\n5. Word matching is crude on purpose, and says nothing about done");

check("stop words do not count as a mention", !scopeMentioned(["Did some work on site today, all done"], SCOPE));
check("plurals fold", significantWords("doors").has("door") && significantWords("door").has("door"));
check("short words do not count", !significantWords("the of a to").size);
check("the module never decides work was done", !/completed|finished|done\b/.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/"[^"]*"/g, "")));

console.log("\n6. Where it sits");

const action = read("../app/(app)/reports/prepare-actions.ts");
const page = read("../app/(app)/reports/[id]/capture/page.tsx");
const button = read("../components/reports/prepare-daily.tsx");
check("Prepare Daily is a server action that asks or drafts", /prepareQuestions\(/.test(action) && /generateReport\(reportId/.test(action));
check("questions come back before any draft", action.indexOf("prepareQuestions(") < action.indexOf("generateReport(reportId"));
check("and only when not forced", /if \(!force\)/.test(action));
check("the draft opens the report", /redirect\(`\/reports\/\$\{reportId\}`\)/.test(action));
check("unread job documents are read first, best effort", action.indexOf("runExtraction(") < action.indexOf("prepareQuestions(") && /could not be read, so today's Daily is written without it/.test(action));
check("only documents added as job context are read - never the whole Documents tab", /from\("job_context_documents"\)/.test(action) && !/from\("documents"\)\s*\.select/.test(action));
check("Prepare Daily anyway is always offered", /Prepare Daily anyway/.test(button) && /name="force" value="1"/.test(button));
check("the questions point at the microphone on the same screen", /Use the microphone at the top/.test(button));
check("Site Capture ends with it", page.lastIndexOf("<PrepareDaily") > page.lastIndexOf("<DocumentUpload"));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PREPARE GATE CHECKS PASSED");
else { for (const f of failures) console.log(`FAILED: ${f}`); process.exitCode = 1; }
