/**
 * The project Activity tab: the job's history, built from records that already
 * exist.
 *
 * The rules are pure and tested directly. The rest guards the two promises
 * this feature was built on - nothing is stored twice, and nothing here can
 * change what a report or an issue does.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync, readdirSync } from "node:fs";

import {
  ACTIVITY_LABELS,
  ACTIVITY_TONES,
  activityDay,
  dailyActivity,
  groupActivity,
  issueActivity,
  mergeActivity,
  summaryActivity,
} from "../lib/projects/activity.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

const daily = [
  {
    id: "d1",
    report_number: 7,
    report_date: "2026-08-12",
    status: "final",
    created_at: "2026-08-12T07:15:00.000Z",
  },
  {
    id: "d2",
    report_number: 8,
    report_date: "2026-08-13",
    status: "draft",
    created_at: "2026-08-13T06:05:00.000Z",
  },
];

const summaries = [
  {
    id: "s1",
    kind: "survey",
    number: 1,
    revision: 0,
    title: null,
    period_start: "2026-08-01",
    period_end: "2026-08-01",
    status: "final",
    created_at: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "s2",
    kind: "progress",
    number: 2,
    revision: 1,
    title: "Week 32",
    period_start: "2026-08-03",
    period_end: "2026-08-09",
    status: "final",
    created_at: "2026-08-10T16:00:00.000Z",
  },
  {
    id: "s3",
    kind: "completion",
    number: 1,
    revision: 0,
    title: null,
    period_start: "2026-08-01",
    period_end: "2026-08-20",
    status: "draft",
    created_at: "2026-08-20T11:00:00.000Z",
  },
];

const issues = [
  {
    id: "i1",
    title: "Water ingress at the loading bay",
    priority: "high",
    status: "closed",
    resolution: "Flashing replaced and retested",
    created_at: "2026-08-05T08:30:00.000Z",
    closed_at: "2026-08-18T14:00:00.000Z",
  },
  {
    id: "i2",
    title: "Missing fire stopping",
    priority: "critical",
    status: "open",
    resolution: null,
    created_at: "2026-08-19T10:00:00.000Z",
    closed_at: null,
  },
];

const groups = [
  dailyActivity(daily),
  summaryActivity(summaries),
  issueActivity(issues, { high: "High", critical: "Critical" }),
];
const timeline = mergeActivity(groups);

console.log("\n1. Every source the brief asked for, and only those");
check(
  "six kinds",
  Object.keys(ACTIVITY_LABELS).join() ===
    "survey,daily,progress,completion,issue_raised,issue_closed",
);
check("each is labelled and toned", Object.keys(ACTIVITY_LABELS).every((k) => ACTIVITY_TONES[k]));
const kinds = new Set(timeline.map((item) => item.kind));
check(
  "all six appear from real rows",
  ["survey", "daily", "progress", "completion", "issue_raised", "issue_closed"].every((k) =>
    kinds.has(k),
  ),
);

console.log("\n2. Newest first");
const times = timeline.map((item) => item.at);
check(
  "descending",
  times.every((at, i) => i === 0 || times[i - 1] >= at),
  times.join(" "),
);
check("the newest thing is at the top", timeline[0].id === "completion:s3");
check("and the oldest at the bottom", timeline[timeline.length - 1].id === "survey:s1");
const again = mergeActivity(groups);
check(
  "the same data always comes out in the same order",
  JSON.stringify(again) === JSON.stringify(timeline),
);
const tied = mergeActivity([
  [
    { id: "b", kind: "daily", at: "2026-08-01T00:00:00.000Z", title: "B", detail: null, href: "/b" },
    { id: "a", kind: "daily", at: "2026-08-01T00:00:00.000Z", title: "A", detail: null, href: "/a" },
  ],
]);
check("including two things in the same second", tied.map((i) => i.id).join() === "a,b");

console.log("\n3. Nothing appears twice");
const ids = timeline.map((item) => item.id);
check("every id is unique", new Set(ids).size === ids.length);
check(
  "merging a source in twice changes nothing",
  mergeActivity([...groups, ...groups]).length === timeline.length,
);
check(
  "an issue raised and an issue closed are separate entries on one record",
  ids.includes("issue_raised:i1") && ids.includes("issue_closed:i1"),
);
check(
  "an issue still open is only raised",
  ids.includes("issue_raised:i2") && !ids.includes("issue_closed:i2"),
);
check("the id says which record it came from", ids.every((id) => id.includes(":")));

console.log("\n4. Each entry says something useful");
const byId = new Map(timeline.map((item) => [item.id, item]));
check("a daily report is numbered", byId.get("daily:d1").title === "Daily Report 007");
check(
  "and says the day it covers and where it stands",
  byId.get("daily:d1").detail === "For 2026-08-12 · Issued" &&
    byId.get("daily:d2").detail.endsWith("Draft"),
);
check("a survey falls back to its kind and number", byId.get("survey:s1").title === "Site survey 001");
check("and reads as one visit, not a span", byId.get("survey:s1").detail.startsWith("Visited "));
check("a titled report keeps its title", byId.get("progress:s2").title === "Week 32");
check("with its period and revision", byId.get("progress:s2").detail === "2026-08-03 to 2026-08-09 · Issued · Rev 1");
check("an issue leads with its priority", byId.get("issue_raised:i1").detail === "High · priority");
check(
  "and a closing leads with the outcome",
  byId.get("issue_closed:i1").detail === "Flashing replaced and retested",
);
check(
  "a closed issue with no note still says so",
  issueActivity([{ ...issues[0], resolution: null }])[1].detail === "Closed",
);
check(
  "a long line is cut rather than allowed to run",
  issueActivity([{ ...issues[0], resolution: "x".repeat(400) }])[1].detail.length <= 120,
);
check(
  "a date formatter is used when one is given",
  dailyActivity(daily, () => "12 August 2026")[0].detail === "For 12 August 2026 · Issued",
);

console.log("\n5. Every entry opens the record it came from");
check(
  "daily reports",
  timeline.filter((i) => i.kind === "daily").every((i) => /^\/reports\/[^/]+$/.test(i.href)),
);
check(
  "surveys, progress and completion reports",
  timeline
    .filter((i) => ["survey", "progress", "completion"].includes(i.kind))
    .every((i) => /^\/summary-reports\/[^/]+$/.test(i.href)),
);
check(
  "issues, raised and closed alike",
  timeline
    .filter((i) => i.kind.startsWith("issue"))
    .every((i) => /^\/issues\/[^/]+$/.test(i.href)),
);
check(
  "and those are the routes the application actually has",
  ["app/(app)/reports/[id]", "app/(app)/summary-reports/[id]", "app/(app)/issues/[id]"].every(
    (route) => {
      try {
        readFileSync(new URL(`../${route}/page.tsx`, import.meta.url));
        return true;
      } catch {
        return false;
      }
    },
  ),
);

console.log("\n6. A long job does not send a thousand rows to a phone");
const many = Array.from({ length: 250 }, (_, n) => ({
  id: `daily:${n}`,
  kind: "daily",
  at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
  title: `Daily Report ${n}`,
  detail: null,
  href: `/reports/${n}`,
}));
check("capped", mergeActivity([many]).length === 100);
check("and it is the newest hundred that survive", mergeActivity([many])[0].id === "daily:249");
check("a caller may ask for fewer", mergeActivity([many], 5).length === 5);
check(
  "an entry with no time is dropped rather than sorted anywhere",
  mergeActivity([[{ ...many[0], at: "" }]]).length === 0,
);

console.log("\n7. Grouped into days for the scroll");
check("the day is the calendar day", activityDay(byId.get("daily:d1")) === "2026-08-12");
const days = groupActivity(timeline);
check("every item is kept", days.reduce((n, d) => n + d.items.length, 0) === timeline.length);
check("a day appears once", new Set(days.map((d) => d.day)).size === days.length);
check(
  "the days stay newest first",
  days.every((d, i) => i === 0 || days[i - 1].day > d.day),
);
check(
  "the caller decides which day a timestamp falls on",
  groupActivity(timeline, () => "one day").length === 1,
);
check("nothing at all groups to nothing", groupActivity([]).length === 0);

console.log("\n8. A view over existing records, not a second copy of them");
const rules = read("../lib/projects/activity.ts");
check("the rules import nothing at runtime", !/^import /m.test(rules));
check("so they can be tested without a database", !/@\//.test(rules));
const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url));
check(
  "no activity table was invented",
  !migrations.some((file) => /activity/i.test(file)) &&
    !migrations.some((file) =>
      /create table[^;]*activity/is.test(read(`../supabase/migrations/${file}`)),
    ),
);
const page = read("../app/(app)/projects/[id]/page.tsx");
check(
  "the timeline is built from the rows the page already had",
  /dailyActivity\(reports/.test(page) && /summaryActivity\(summaryReports/.test(page),
);
check(
  "with one extra query, and only on the tab that shows it",
  (page.match(/from\("issues"\)/g) ?? []).length === 2 && /wantsActivity\n?\s*\?/.test(page),
);
check(
  "which reads closed issues too, because the Issues tab hides them",
  /closed_at/.test(page),
);
check("no insert, update or delete happens to draw a timeline", !/\.insert\(|\.update\(|\.delete\(/.test(read("../components/projects/project-activity.tsx")));
check("and no server action was added for it", !/use server/.test(read("../components/projects/project-activity.tsx")));

console.log("\n9. Wired into the project page as a tab");
const tabs = read("../lib/project-tabs.ts");
check("the tab exists", /key: "activity", label: "Activity"/.test(tabs));
check(
  "the existing tabs are untouched",
  ["overview", "reports", "photos", "issues", "documents"].every((key) =>
    tabs.includes(`key: "${key}"`),
  ),
);
check("and the page renders it", /activeTab === "activity"[\s\S]{0,200}<ProjectActivity/.test(page));
check(
  "a source that will not load is named rather than fatal",
  /unavailable=\{activityIssuesResult\?\.error/.test(page),
);

console.log("\n10. Built for a phone, in the SiteBoss palette");
const view = read("../components/projects/project-activity.tsx");
check("one column, not a grid", !/grid-cols/.test(view));
check("a rail down the left", /w-0\.5[\s\S]{0,40}bg-line|bg-line[\s\S]{0,40}w-0\.5/.test(view));
check("the whole row opens the record", /<Link[\s\S]{0,200}href=\{item\.href\}/.test(view));
check("the type is a badge as well as an icon", /<Badge tone=\{tone\}/.test(view) && /ICONS\[item\.kind\]/.test(view));
check(
  "colours come from the shared tokens, never from hex",
  !/#[0-9a-f]{3,6}/i.test(view) &&
    /text-ink\b/.test(view) &&
    /border-line\b/.test(view),
);
check("the markers use the badge tones", /border-info\/25 bg-info-soft text-info/.test(view));
check("there is an empty state", /EmptyState/.test(view));
check(
  "and the time is read on UK time rather than the server's",
  /Europe\/London/.test(read("../lib/utils.ts")) && /formatTime/.test(view) && /ukDay/.test(view),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL ACTIVITY CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
