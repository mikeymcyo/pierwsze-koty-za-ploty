/**
 * The timing line on a report in a list.
 *
 * The report date alone does not tell you chronology - two reports can carry
 * the same date, and one dated Monday may have been written on Monday evening
 * and issued on Wednesday. This is what the list says instead, and it has to
 * stay short enough to sit under a title on a phone.
 *
 * Run with the TSX loader, because the rule reads the application's own
 * formatters rather than keeping a second copy of them (F21).
 *
 *   npm run test:timing
 */
import { readFileSync } from "node:fs";

import { reportTiming } from "../lib/reports/timing.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

// A fixed "now" so the year rule is testable rather than seasonal.
const NOW = new Date("2026-08-30T09:00:00.000Z");

console.log("\n1. A draft says when it was started");
const draft = reportTiming("2026-08-25T13:32:00.000Z", null, NOW);
check("the day and the time", draft.created === "Created 25 Aug, 14:32", String(draft.created));
check("and nothing about issuing", draft.issued === null, String(draft.issued));

console.log("\n2. British Summer Time is applied, not the server's UTC");
check(
  "half past midnight BST is not the day before",
  reportTiming("2026-08-25T23:30:00.000Z", null, NOW).created === "Created 26 Aug, 00:30",
  String(reportTiming("2026-08-25T23:30:00.000Z", null, NOW).created),
);
check(
  "and winter is read as GMT",
  reportTiming("2026-01-14T23:30:00.000Z", null, NOW).created === "Created 14 Jan, 23:30",
  String(reportTiming("2026-01-14T23:30:00.000Z", null, NOW).created),
);

console.log("\n3. An issued report says when it went out");
const sameDay = reportTiming("2026-08-25T13:32:00.000Z", "2026-08-25T16:05:00.000Z", NOW);
check("both halves", sameDay.created === "Created 25 Aug, 14:32", String(sameDay.created));
check(
  "and the date is not repeated on the same day",
  sameDay.issued === "Issued 17:05",
  String(sameDay.issued),
);

const laterDay = reportTiming("2026-08-25T13:32:00.000Z", "2026-08-27T08:10:00.000Z", NOW);
check(
  "but it is when the report was issued later",
  laterDay.issued === "Issued 27 Aug, 09:10",
  String(laterDay.issued),
);
check(
  "a report written late and issued after midnight reads as two days",
  reportTiming("2026-08-25T22:40:00.000Z", "2026-08-25T23:40:00.000Z", NOW).issued ===
    "Issued 26 Aug, 00:40",
  String(reportTiming("2026-08-25T22:40:00.000Z", "2026-08-25T23:40:00.000Z", NOW).issued),
);

console.log("\n4. The year appears only when it is not this one");
check(
  "this year is bare",
  !reportTiming("2026-02-03T10:00:00.000Z", null, NOW).created.includes("2026"),
);
check(
  "an older report carries its year",
  reportTiming("2025-11-03T10:00:00.000Z", null, NOW).created === "Created 3 Nov 2025, 10:00",
  String(reportTiming("2025-11-03T10:00:00.000Z", null, NOW).created),
);

console.log("\n5. A row that cannot say when says nothing");
for (const value of [null, undefined, "", "not a timestamp"]) {
  const timing = reportTiming(value, null, NOW);
  check(`no half-filled line for ${JSON.stringify(value)}`, timing.created === null);
}
check(
  "an issued time still shows when the creation is unreadable",
  reportTiming(null, "2026-08-25T16:05:00.000Z", NOW).issued === "Issued 25 Aug, 17:05",
);
const line = read("../components/reports/report-timing.tsx");
check("and the line is dropped rather than rendered empty", /return null/.test(line));

console.log("\n6. Both lists carry it, and both ask the database for it");
for (const file of [
  "../components/reports/report-row.tsx",
  "../components/summary-reports/summary-row.tsx",
]) {
  const row = read(file);
  check(`${file.split("/").pop()} shows the timing`, /<ReportTiming/.test(row));
  check(
    `${file.split("/").pop()} takes both timestamps`,
    /created_at/.test(row) && /finalised_at/.test(row),
  );
}
for (const file of ["../app/(app)/reports/page.tsx", "../app/(app)/projects/[id]/page.tsx"]) {
  const page = read(file);
  const selects = page.match(/\.select\("[^"]*"\)|select\("[^"]*"\)/g) ?? [];
  const rowSelects = selects.filter((s) => /report_number|kind, number/.test(s));
  check(
    `${file.split("/").slice(-2).join("/")} selects both timestamps for every row`,
    rowSelects.length > 0 &&
      rowSelects.every((s) => s.includes("created_at") && s.includes("finalised_at")),
    JSON.stringify(rowSelects),
  );
}

console.log("\n7. It stays a line, not a block");
check(
  "one span, subtle, on the badge's own line",
  /text-xs text-ink-subtle/.test(line) && !/<div/.test(line),
);
check(
  "the halves are joined rather than stacked",
  /join\(" · "\)/.test(line),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL REPORT TIMING CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
