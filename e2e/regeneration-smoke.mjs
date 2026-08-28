/**
 * What "Rewrite from my notes" is allowed to touch.
 *
 * Two rules meet here and pull in opposite directions. Regenerating must
 * replace what the model wrote, including clearing sections a new draft no
 * longer supports - a stale paragraph under a heading today's notes do not
 * carry is a false claim in a document that goes to a client. But a paragraph
 * a site manager rewrote in his own words is his, and losing it to a button
 * press would be the worst failure this screen has.
 *
 * ai_generated is what separates them: updateSection sets it false the moment
 * anybody edits.
 *
 *   npm run test:regeneration
 *
 * The database half - that the upsert and the delete really do respect this -
 * is in ai-smoke.mjs, which needs a Supabase.
 */

import { describeRegeneration, partitionDraft } from "../lib/reports/regeneration.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const ALL = ["executive_summary", "works_completed", "deliveries_plant", "planned_works"];

console.log("\n1. An untouched report is entirely the model's to rewrite");
const fresh = partitionDraft(ALL, []);
check("everything is written", fresh.write.length === 4, JSON.stringify(fresh.write));
check("nothing is held back", fresh.kept.length === 0);

console.log("\n2. An edited section is held back");
const one = partitionDraft(ALL, ["executive_summary"]);
check("it is not written", !one.write.includes("executive_summary"), JSON.stringify(one.write));
check("it is reported as kept", one.kept.join() === "executive_summary");
check("the rest are still rewritten", one.write.length === 3, JSON.stringify(one.write));
check(
  "order is preserved for the ones that are written",
  one.write.join() === "works_completed,deliveries_plant,planned_works",
  one.write.join(),
);

console.log("\n3. Several edits, and a report edited end to end");
const some = partitionDraft(ALL, ["works_completed", "planned_works"]);
check("both are held back", some.kept.join() === "works_completed,planned_works");
check("the others are written", some.write.join() === "executive_summary,deliveries_plant");

const allEdited = partitionDraft(ALL, ALL);
check("nothing is written when every section is the user's", allEdited.write.length === 0);
check("and all four are reported as kept", allEdited.kept.length === 4);

console.log("\n4. An edit to a section this draft does not cover changes nothing");
// health_safety carries an edit, but the new draft has nothing for it. It must
// not appear in either list - there is no decision to make about it here, and
// the clear-out spares it because it is not ai_generated.
const unrelated = partitionDraft(["works_completed"], ["health_safety"]);
check("the drafted section is written", unrelated.write.join() === "works_completed");
check("the unrelated edit is not counted as kept", unrelated.kept.length === 0);

console.log("\n5. An empty draft writes nothing");
const nothing = partitionDraft([], ["executive_summary"]);
check("no writes", nothing.write.length === 0);
check("no kept", nothing.kept.length === 0);

console.log("\n6. The user is told what happened");
check(
  "a clean regeneration says so",
  describeRegeneration({ generated: 4, kept: 0 }) === "4 sections rewritten from your notes.",
  describeRegeneration({ generated: 4, kept: 0 }),
);
check(
  "one kept section is named in the singular",
  describeRegeneration({ generated: 3, kept: 1 }) ===
    "3 sections rewritten. 1 section you had edited was left as you wrote it.",
  describeRegeneration({ generated: 3, kept: 1 }),
);
check(
  "several kept sections read correctly",
  describeRegeneration({ generated: 2, kept: 2 }) ===
    "2 sections rewritten. 2 sections you had edited were left as you wrote them.",
  describeRegeneration({ generated: 2, kept: 2 }),
);
check(
  "one rewritten section is singular too",
  describeRegeneration({ generated: 1, kept: 0 }) === "1 section rewritten from your notes.",
  describeRegeneration({ generated: 1, kept: 0 }),
);

// The confusing case: the button appears to do nothing. It must say why.
const none = describeRegeneration({ generated: 0, kept: 2 });
check("a regeneration that wrote nothing explains itself", none.startsWith("Nothing was rewritten"), none);
check("and says how to get a section written again", /Clear a section/.test(none), none);
check(
  "no message is ever silent about kept sections",
  [
    describeRegeneration({ generated: 0, kept: 1 }),
    describeRegeneration({ generated: 5, kept: 3 }),
  ].every((message) => /you had edited/.test(message)),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL REGENERATION CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
