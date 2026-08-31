import {
  canFinaliseSummary,
  summaryPdfFileName,
} from "../lib/summary-reports/finalisation.ts";
import {
  COMPLETION_SECTIONS,
  PROGRESS_SECTIONS,
  summarySectionOrder,
} from "../lib/summary-reports/sections.ts";
import { completionSourcePlan } from "../lib/summary-reports/source-plan.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. Each document has the right sections");
check("Progress has seven sections", PROGRESS_SECTIONS.length === 7);
check("Completion has eight sections", COMPLETION_SECTIONS.length === 8);
check(
  "both carry issues and resolutions",
  PROGRESS_SECTIONS.some((section) => section.type === "issues_and_resolutions") &&
    COMPLETION_SECTIONS.some((section) => section.type === "issues_and_resolutions"),
);
check(
  "only Progress promises a next period",
  summarySectionOrder("progress").includes("next_period") &&
    !summarySectionOrder("completion").includes("next_period"),
);
check(
  "only Completion carries sign-off",
  summarySectionOrder("completion").includes("sign_off") &&
    !summarySectionOrder("progress").includes("sign_off"),
);

console.log("\n2. Completion provenance prefers reviewed Progress Reports");
const plan = completionSourcePlan(
  ["daily-1", "daily-2", "daily-3", "daily-3"],
  [
    { id: "progress-1", dailyIds: ["daily-1", "daily-2"] },
    { id: "progress-2", dailyIds: ["daily-2"] },
  ],
);
check("both issued Progress Reports remain sources", plan.progressIds.join() === "progress-1,progress-2");
check("a Daily Report is never duplicated", plan.daily.length === 3, JSON.stringify(plan.daily));
check("covered evidence names its first reviewed route", plan.daily[1].via === "progress-1");
check("uncovered evidence remains direct", plan.daily[2].via === null);

console.log("\n3. Issuing rules");
check(
  "a populated sourced draft can be issued",
  canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 3, sectionCount: 4 }).ok,
);
check(
  // No kind requires a source any more. A completion report written directly
  // says so on its own screen, prints no source record and is forbidden by
  // its prompt to claim one - see e2e/standalone-progress-smoke.mjs.
  "a completion report written directly can too",
  canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 0, sectionCount: 4 }).ok,
);
check(
  "a report without written sections cannot",
  !canFinaliseSummary({ status: "draft", kind: "completion", sourceCount: 3, sectionCount: 0 }).ok,
);
check("an issued report cannot be issued again", !canFinaliseSummary({ status: "final", sourceCount: 3, sectionCount: 4 }).ok);

console.log("\n4. Stored filenames identify the document");
const progressName = summaryPdfFileName("progress", 4, 0, new Date("2026-08-28T18:07:09.000Z"));
const revisionName = summaryPdfFileName("completion", 2, 1, new Date("2026-08-28T18:07:09.000Z"));
check("Progress number is padded", progressName.startsWith("progress-report-004-"), progressName);
check("a revision is explicit", revisionName.includes("completion-report-002-rev-1"), revisionName);
check("filenames are storage-safe PDFs", [progressName, revisionName].every((name) => /^[a-z0-9.-]+\.pdf$/.test(name)));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL SUMMARY REPORT CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
