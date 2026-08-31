/**
 * Every section has a different job, and the safeguards that keep the writing
 * honest are still in force.
 *
 * The bug this guards: a model asked to fill eight fields from one body of
 * evidence will fill all eight, so Summary and Works completed came back as
 * the same sentence twice, and Project overview, Scope of works and Stages of
 * works as three paraphrases of one paragraph. Needs neither Supabase, a dev
 * server, nor an API key.
 */
import { SYSTEM_PROMPT } from "../lib/ai/prompt.ts";
import { SUMMARY_SYSTEM_PROMPT } from "../lib/ai/summary-prompt.ts";
import { CLEANUP_SECTIONS } from "../lib/ai/cleanup-prompt.ts";
import { REPORT_SECTIONS } from "../lib/report-sections.ts";
import { partitionDraft } from "../lib/reports/regeneration.ts";
import { COMPLETION_SECTIONS, PROGRESS_SECTIONS } from "../lib/summary-reports/sections.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const briefOf = (sections, type) => sections.find((s) => s.type === type)?.brief ?? "";
const CLEANUP_DAILY_OUTSTANDING = briefOf(CLEANUP_SECTIONS.daily, "outstanding_items");
const CLEANUP_DAILY_PLANNED = briefOf(CLEANUP_SECTIONS.daily, "planned_works");

console.log("\n1. Daily Summary and Works completed are given different jobs");
const summary = briefOf(REPORT_SECTIONS, "executive_summary");
const completed = briefOf(REPORT_SECTIONS, "works_completed");
check("both briefs exist", Boolean(summary) && Boolean(completed));
check("they are not the same text", summary !== completed);
check(
  "the summary is told it is an overview, not a list",
  /overview/i.test(summary) && /not list|do not list/i.test(summary),
  summary,
);
check(
  "the summary is told the activities live elsewhere",
  /works completed/i.test(summary),
);
check(
  "works completed is told to carry the particulars",
  ["location", "trade", "material"].every((word) => new RegExp(word, "i").test(completed)),
  completed,
);
check(
  "and is told to take a sentence that would fit both",
  /equally well|belongs here/i.test(completed),
);

console.log("\n2. The daily prompt allocates each fact to one section");
check(
  "it asks for the allocation to happen before writing",
  /before you write anything, decide where each fact belongs/i.test(SYSTEM_PROMPT),
);
check(
  "every fact has one primary section",
  /one\s+primary section/i.test(SYSTEM_PROMPT),
);
check(
  "the old licence to restate in the summary is gone",
  !/summary may restate/i.test(SYSTEM_PROMPT),
);
check(
  "padding a section from another is called out as the error it is",
  /never repeat a fact in a second section/i.test(SYSTEM_PROMPT),
);
check(
  "a short section is stated to be a correct section",
  /a short section is a correct section/i.test(SYSTEM_PROMPT),
);

console.log("\n3. Consolidated sections have separate responsibilities");
const overview = briefOf(COMPLETION_SECTIONS, "project_overview");
const scope = briefOf(COMPLETION_SECTIONS, "scope_of_works");
const stages = briefOf(COMPLETION_SECTIONS, "stages_of_works");
check(
  "overview, scope and stages are three different briefs",
  new Set([overview, scope, stages]).size === 3,
);
check("the overview disclaims the other two", /not a list of workstreams/i.test(overview) && /sequence/i.test(overview), overview);
check("scope is about what was included, not how", /what was included/i.test(scope) && /not how or when/i.test(scope), scope);
check("stages is chronological and disclaims scope", /in order/i.test(stages) && /not the scope list/i.test(stages), stages);
check(
  "completed works must not restate the scope",
  /not restate the scope/i.test(briefOf(COMPLETION_SECTIONS, "completed_works")),
);
check(
  "the period summary does not duplicate key activities",
  /not the activity list/i.test(briefOf(PROGRESS_SECTIONS, "period_summary")),
);
check(
  "works completed is not a restatement of key activities",
  /not a restatement of key activities/i.test(briefOf(PROGRESS_SECTIONS, "works_completed")),
);
check(
  "every brief in both documents is unique",
  new Set([...PROGRESS_SECTIONS, ...COMPLETION_SECTIONS].map((s) => s.brief)).size ===
    [...PROGRESS_SECTIONS, ...COMPLETION_SECTIONS].length,
);

console.log("\n4. The consolidating prompt allocates facts too");
check(
  "it names the allocation step",
  /ALLOCATING FACTS TO SECTIONS/.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "it says to decide before writing",
  /before writing anything/i.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "it forbids padding an empty section from another",
  /never pad a section/i.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "it prefers empty sections to duplicated ones",
  /worth less to the reader/i.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "it gives each section a one-line job",
  ["Project overview:", "Scope of works:", "Stages of works:", "Completed works:"].every((name) =>
    SUMMARY_SYSTEM_PROMPT.includes(name),
  ),
);

console.log("\n5. The evidence safeguards are untouched");
for (const [name, prompt] of [["daily", SYSTEM_PROMPT], ["consolidated", SUMMARY_SYSTEM_PROMPT]]) {
  check(`${name}: silence is not evidence of absence`, /silence is not evidence of absence/i.test(prompt));
  check(`${name}: an unsupported section stays empty`, /empty string/i.test(prompt));
  check(
    `${name}: no invented approval, compliance or certification`,
    /approv/i.test(prompt) && /complian|certif/i.test(prompt),
  );
}
check(
  "the daily prompt still forbids inventing a nil return",
  /never write that there were no delays/i.test(SYSTEM_PROMPT),
);
check(
  "the daily prompt still forbids inventing completion status",
  /completion or progress status the notes do not state/i.test(SYSTEM_PROMPT),
);
check(
  "the daily prompt still forbids inventing health and safety events",
  /health and safety events, briefings, or the absence of them/i.test(SYSTEM_PROMPT),
);
check(
  "the consolidated prompt still refuses to be a certificate",
  /not itself a certificate of completion/i.test(SUMMARY_SYSTEM_PROMPT),
);
check(
  "sections that could invent a nil return are told to stay empty instead",
  [
    briefOf(PROGRESS_SECTIONS, "issues_and_resolutions"),
    briefOf(COMPLETION_SECTIONS, "issues_and_resolutions"),
    briefOf(PROGRESS_SECTIONS, "next_period"),
  ].every((brief) => /leave empty rather than/i.test(brief)),
);

console.log("\n6. A section somebody rewrote is still theirs");
const drafted = ["executive_summary", "works_completed", "health_safety"];
const split = partitionDraft(drafted, ["works_completed"]);
check("an edited section is kept", split.kept.join() === "works_completed");
check("the rest are still rewritten", split.write.join() === "executive_summary,health_safety");
check(
  "editing every section means nothing is overwritten",
  partitionDraft(drafted, drafted).write.length === 0,
);
check(
  "and editing none means all are rewritten",
  partitionDraft(drafted, []).write.length === 3,
);

console.log("\n7. Outstanding items and Planned works are not two chances to say one thing");
const outstanding = briefOf(REPORT_SECTIONS, "outstanding_items");
const planned = briefOf(REPORT_SECTIONS, "planned_works");
check("both briefs exist", Boolean(outstanding) && Boolean(planned));
check("they are not the same text", outstanding !== planned);
check(
  "outstanding is what the works wait on somebody else for",
  /awaiting/i.test(outstanding) && /(another party|decision|instruction)/i.test(outstanding),
);
check(
  "planned is what we intend to do, and says it is not the waiting one",
  /intend/i.test(planned) && /(not waiting|waiting on)/i.test(planned),
);
check(
  "an item that is both is told to appear once, under outstanding",
  /do not repeat it under Planned works/i.test(outstanding) &&
    /belongs there/i.test(planned),
);
check(
  "and its timing is kept rather than dropped to avoid the repeat",
  /with its timing/i.test(outstanding) || /timing/i.test(outstanding),
);
check(
  "the system prompt carries the rule as well as the briefs",
  /EACH FACT BELONGS IN ONE SECTION ONLY/.test(SYSTEM_PROMPT),
);
check(
  "it names the two sections it is about",
  /Outstanding items and Planned\s+works/.test(SYSTEM_PROMPT),
);
check(
  "it draws the line by who the work is waiting on",
  /WAITING ON/.test(SYSTEM_PROMPT) && /ours to schedule/.test(SYSTEM_PROMPT),
);
check(
  "it shows the one-sentence form rather than only forbidding the repeat",
  /remains outstanding pending/.test(SYSTEM_PROMPT) && /programmed for/.test(SYSTEM_PROMPT),
);
check(
  "and refuses the two cheap ways out: dropping the timing, or hedging it",
  /Losing the timing is not an acceptable way/.test(SYSTEM_PROMPT) &&
    /at the certainty the notes give it/.test(SYSTEM_PROMPT),
);
check(
  "the cleanup pass draws the same line",
  /belongs under Outstanding items with its timing/.test(CLEANUP_DAILY_PLANNED) &&
    /does not become a planned work as well/.test(CLEANUP_DAILY_OUTSTANDING),
);
check(
  "and none of it turns into a nil return",
  /Leave this empty rather than stating that nothing is outstanding/.test(outstanding),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL SECTION ROLE CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
