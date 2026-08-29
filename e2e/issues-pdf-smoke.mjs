/**
 * Phase 6 rules: what goes in an issued report, and what "final" means.
 *
 * The PDF layout itself is in lib/pdf/report-document.tsx and needs a renderer
 * to look at; what is asserted here is every decision about *content* - which
 * sections print, which issues, which photographs, and whether a report may be
 * issued at all - because those are the ones that put a wrong claim in a
 * document a client keeps.
 *
 *   npm run test:issues-pdf
 *
 * The database half - raising an issue from a report, it appearing under the
 * project, finalising, and a finalised report refusing further edits - is in
 * e2e/pdf-smoke.mjs, which needs a Supabase.
 */

import { Buffer } from "node:buffer";

import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  closedAtFor,
  hasRequiredResolution,
  sortIssues,
} from "../lib/issues/metadata.ts";
import {
  issuesForReport,
  orderedSections,
  photosWithData,
  reportNumberLabel,
} from "../lib/pdf/report-data.ts";
import { photoPrintLabel } from "../lib/photo-captions.ts";
import { canFinalise, pdfFileName } from "../lib/reports/finalisation.ts";
import { REPORT_SECTION_LABELS, REPORT_SECTION_ORDER } from "../lib/report-sections.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. The written report prints in order, without empty headings");
const sections = orderedSections(
  [
    { section_type: "planned_works", content: "Second fix continues." },
    { section_type: "executive_summary", content: "External works progressed." },
    { section_type: "health_safety", content: "   " },
    { section_type: "works_completed", content: "Signage installed." },
    { section_type: "issues_constraints", content: null },
  ],
  REPORT_SECTION_ORDER,
  REPORT_SECTION_LABELS,
);

check(
  "sections come out in report order, not the order they were stored",
  sections.map((s) => s.type).join() === "executive_summary,works_completed,planned_works",
  sections.map((s) => s.type).join(),
);
check("an empty section is dropped", !sections.some((s) => s.type === "issues_constraints"));
check(
  "a whitespace-only section is dropped too",
  !sections.some((s) => s.type === "health_safety"),
  "a blank heading in a client document reads as an omission",
);
check("each carries its printed label", sections[0].label === "Summary", sections[0].label);

console.log("\n2. Issues on the report");
const issues = issuesForReport(
  [
    { id: "a", title: "Low one", description: null, responsible: null, priority: "low", status: "open" },
    { id: "b", title: "Critical one", description: "Blocked", responsible: "Groundworks", priority: "critical", status: "in_progress" },
    { id: "c", title: "Closed one", description: null, responsible: null, priority: "high", status: "closed" },
  ],
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
);

check("worst first", issues.map((i) => i.id).join() === "b,c,a", issues.map((i) => i.id).join());
check(
  "a closed issue still prints - it happened that day",
  issues.some((i) => i.id === "c"),
);
check("priorities are labelled for a reader", issues[0].priorityLabel === "Critical");
check("so are statuses", issues[0].statusLabel === "In progress", issues[0].statusLabel);

console.log("\n3. Photographs");
const bytes = Buffer.from([0xff, 0xd8, 0xff]);
const printable = photosWithData(
  [
    { id: "p1", caption: "Chemical anchors", category: "progress", storage_path: "c/p/1.jpg" },
    { id: "p2", caption: null, category: "safety", storage_path: "c/p/missing.jpg" },
    { id: "p3", caption: "Made good", category: "after", storage_path: "c/p/3.jpg" },
  ],
  new Map([
    ["c/p/1.jpg", bytes],
    ["c/p/3.jpg", bytes],
  ]),
);

check("only photos whose bytes were read are printed", printable.length === 2);
check(
  "a photo that could not be read is left out, not printed broken",
  !printable.some((p) => p.id === "p2"),
);
check("captions stay with their own photo", printable[0].caption === "Chemical anchors");
// photosWithData now passes the raw category through; how it reads is
// decided by lib/photo-captions.ts and asserted in photo-captions-smoke.
check("and so do categories", printable[1].category === "after", printable[1].category);
check(
  "which the document turns into words",
  photoPrintLabel(printable[1]).status === "After",
  String(photoPrintLabel(printable[1]).status),
);
check("order is preserved", printable.map((p) => p.id).join() === "p1,p3");

console.log("\n4. Whether a report may be issued");
check(
  "a drafted report with sections can be",
  canFinalise({ status: "draft", rawNotes: "spoke about the day", sectionCount: 3 }).ok,
);
check(
  "so can one with notes but no written sections yet",
  canFinalise({ status: "draft", rawNotes: "spoke about the day", sectionCount: 0 }).ok,
);

const empty = canFinalise({ status: "draft", rawNotes: "   ", sectionCount: 0 });
check("an empty report cannot", !empty.ok);
check("and is told why", !empty.ok && empty.reason === "no-content");

// The one that matters: an issued PDF is what the client was sent.
const again = canFinalise({ status: "final", rawNotes: "notes", sectionCount: 4 });
check("a finalised report cannot be finalised again", !again.ok);
check("because it is already issued", !again.ok && again.reason === "already-final");
check(
  "and the message says the PDF is not regenerated",
  !again.ok && /not regenerated/i.test(again.message),
  again.ok ? "" : again.message,
);

console.log("\n5. The stored file");
const name = pdfFileName(7, new Date("2026-08-28T14:05:09.000Z"));
check("carries the padded report number", name.startsWith("report-007-"), name);
check("is a pdf", name.endsWith(".pdf"), name);
check("carries a timestamp, so a future revision cannot collide", /2026-08-28-14-05-09/.test(name), name);
check("has no characters that need escaping in a storage path", /^[a-z0-9.-]+$/.test(name), name);
check("the printed number is padded to sort", reportNumberLabel(7) === "007");

console.log("\n6. Issue bookkeeping");
check(
  "closing an issue stamps when",
  typeof closedAtFor("closed", null) === "string",
);
check(
  "closing one that was already closed keeps the original date",
  closedAtFor("closed", "2026-08-01T00:00:00.000Z") === "2026-08-01T00:00:00.000Z",
);
check("reopening clears it", closedAtFor("open", "2026-08-01T00:00:00.000Z") === null);
check("so does moving it to in progress", closedAtFor("in_progress", "2026-08-01T00:00:00.000Z") === null);
check("an open issue does not require a resolution", hasRequiredResolution("open", null));
check("a closed issue does require a resolution", !hasRequiredResolution("closed", "  "));
check("a recorded outcome allows closure", hasRequiredResolution("closed", "Damaged unit replaced."));

const listed = sortIssues([
  { id: "old-medium", priority: "medium", created_at: "2026-08-01" },
  { id: "new-critical", priority: "critical", created_at: "2026-08-28" },
  { id: "old-low", priority: "low", created_at: "2026-07-01" },
  { id: "older-medium", priority: "medium", created_at: "2026-07-15" },
]);
check(
  "worst first, then longest outstanding",
  listed.map((i) => i.id).join() === "new-critical,older-medium,old-medium,old-low",
  listed.map((i) => i.id).join(),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL ISSUE AND PDF CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
