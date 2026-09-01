/**
 * Store 1848: the work already here comes first.
 *
 * A site manager dictated into a Daily Report against Store 1848 that morning.
 * Later he searched the store again and SiteBoss offered him "Create project
 * here" - so he took it, and a second project exists with no store link and no
 * reports, while the one he already had sat below the fold with 772 characters
 * of his own words in it.
 *
 * Nothing was lost and nothing was broken. The store-to-project link was
 * written, the query that reads it was correct, and the Daily Report was there
 * the whole time. What was wrong is that nothing looked for an open Daily, and
 * the order of the screen put starting something new above continuing
 * something started.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:store-continuity
 */

import { readFileSync } from "node:fs";

import {
  captureInProgress,
  continueCaptureHref,
  describeCaptureProgress,
  describeLastUpdated,
  isCurrent,
  projectHref,
  splitProjects,
} from "../lib/reports/continuity.ts";
import { captureCount, parseCaptureLog } from "../lib/reports/capture-log.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const storePage = read("../app/(app)/stores/[code]/page.tsx");
const dashboard = read("../app/(app)/dashboard/page.tsx");
const card = read("../components/reports/capture-in-progress.tsx");
const captureActions = read("../app/(app)/reports/capture-actions.ts");

// The real report from the real test, shortened.
const notes =
  "[08:36] So the PO describes a leaking pipe under the sink and the faulty warehouse doors which we are about to go and fix\n\n" +
  "[08:41] Most likely the issue is a perished seal\n\n" +
  "[09:12] Doors need a new closer";

const today = {
  id: "daily-today",
  projectId: "po",
  projectName: "Po",
  reportNumber: 1,
  reportDate: "2026-09-01",
  updatedAt: "2026-09-01T09:49:00.000Z",
  captureCount: captureCount(notes),
};
const yesterday = {
  ...today,
  id: "daily-yesterday",
  reportNumber: 0,
  reportDate: "2026-08-31",
  updatedAt: "2026-08-31T17:10:00.000Z",
};

console.log("\n1. The store resolves the work already at it");

check(
  "the page reads the projects linked to this store",
  /\.eq\("location_directory", store\.directoryId\)/.test(storePage) &&
    /\.eq\("location_code", store\.code\)/.test(storePage),
  "this was always correct - it is what is done with the answer that changed",
);
check(
  "and now asks whether any of them has a Daily still open",
  /\.in\(\s*\n?\s*"project_id",[\s\S]{0,160}\.eq\("status", "draft"\)/.test(storePage),
  "the query nothing was making",
);
check("scoped to those projects, not to every report", /here\.map\(\(project\) => project\.id\)/.test(storePage));
check("most recently touched first", /\.order\("updated_at", \{ ascending: false \}\)/.test(storePage));
check(
  "and it reads the notes so it can say how much is in there",
  /captureCount\(row\.raw_notes\)/.test(storePage),
);

console.log("\n2. Which Daily is offered");

check("today's, out of several", captureInProgress([yesterday, today], "2026-09-01").id === "daily-today");
check("whatever order they arrive in", captureInProgress([today, yesterday], "2026-09-01").id === "daily-today");
check(
  "yesterday's where nothing was started today, because it is still unfinished",
  captureInProgress([yesterday], "2026-09-01").id === "daily-yesterday",
);
check(
  "the one worked on last, where two are open for the same day",
  captureInProgress(
    [today, { ...today, id: "later", updatedAt: "2026-09-01T11:00:00.000Z" }],
    "2026-09-01",
  ).id === "later",
);
check("and nothing where nothing is open", captureInProgress([], "2026-09-01") === null);

console.log("\n3. Continue reopens the report that exists - it never makes one");

check(
  "the link is the report's own id",
  continueCaptureHref(today) === "/reports/daily-today/capture",
);
check("and the card uses it", /continueCaptureHref\(draft\)/.test(card));
check(
  "not the open-or-create action",
  !/openSiteCapture/.test(card),
  "a route that could create is a route that will",
);
check("Open project goes to the project", projectHref({ id: "po" }) === "/projects/po");

// And the action that can create still cannot make a second Daily for a day.
check(
  "starting a capture still opens today's report if there is one",
  /if \(existing\) redirect\(`\/reports\/\$\{existing\.id\}\/capture`\)/.test(captureActions),
);
check(
  "matched on this project, still a draft, dated today",
  /\.eq\("project_id", projectId\)/.test(captureActions) &&
    /\.eq\("status", "draft"\)/.test(captureActions) &&
    /\.eq\("report_date", date\)/.test(captureActions),
);
check(
  "and the store page offers that action only where no capture is already open",
  /inProgress\?\.projectId === project\.id \? null : \(/.test(storePage),
  "two ways into the same report on one screen is how a duplicate gets made",
);

console.log("\n4. Every captured word survives the round trip");

check("three entries went in", parseCaptureLog(notes).length === 3);
check("and the card says so", describeCaptureProgress(today) === "3 notes captured");
check("one reads as one", describeCaptureProgress({ ...today, captureCount: 1 }) === "1 note captured");
check(
  "a report opened but not spoken into says that instead",
  describeCaptureProgress({ ...today, captureCount: 0 }) === "Nothing captured yet",
);
check(
  "continuing reads the notes from the report, not from the phone",
  /parseCaptureLog\(report\.raw_notes\)/.test(read("../app/(app)/reports/[id]/capture/page.tsx")),
);
check(
  "and appending still keeps everything already there",
  /appendCapture\(current\.raw_notes/.test(captureActions),
);

console.log("\n5. What is happening here is above what would start something new");

const inProgressAt = storePage.indexOf("<CaptureInProgress");
const currentAt = storePage.indexOf('{current.length > 0 ? (');
const detailsAt = storePage.indexOf('<Detail label="Address"');
const newProjectAt = storePage.indexOf("newProjectHref(store)");
const historicalAt = storePage.indexOf("Earlier work here");

check("the capture card is on the page", inProgressAt !== -1);
check("above the store's own details", inProgressAt < detailsAt);
check("the live projects are above them too", currentAt > inProgressAt && currentAt < detailsAt);
check(
  "and both are above any way of creating a new project",
  currentAt < newProjectAt && inProgressAt < newProjectAt,
);
check("earlier work sits below all of it", historicalAt > newProjectAt);
check(
  "creating a project is no longer the primary action",
  /variant="secondary" className="sm:flex-1">\s*\n\s*<Link href=\{newProjectHref\(store\)\}>/.test(
    storePage,
  ),
);
check(
  "and says plainly that it would be another one",
  /Create another project here/.test(storePage),
);
check("a live project offers Open project", /Open project/.test(storePage));
check("and a way to start capturing against it", /Start Site Capture/.test(storePage));
check(
  "a survey counts as live work rather than history",
  isCurrent({ status: "survey" }) && isCurrent({ status: "active" }),
);
check(
  "and finished or paused work does not",
  !isCurrent({ status: "completed" }) && !isCurrent({ status: "on_hold" }),
);
const split = splitProjects([
  { id: "a", name: "A", reference: null, status: "active" },
  { id: "b", name: "B", reference: null, status: "completed" },
  { id: "c", name: "C", reference: null, status: "survey" },
]);
check("the split keeps each side in order", split.current.map((p) => p.id).join() === "a,c");
check("and files the rest below", split.historical.map((p) => p.id).join() === "b");

console.log("\n6. The dashboard says it too");

check("the same card, so the answer looks the same", /<CaptureInProgress draft=\{inProgress\}/.test(dashboard));
check(
  "above the quick actions rather than below them",
  dashboard.indexOf("<CaptureInProgress") < dashboard.indexOf('label="Site Capture"'),
);
check("built from the same rule", /captureInProgress\(openDrafts, workingDay\(\)\)/.test(dashboard));
check(
  "and the draft it shows is not listed twice",
  /\.filter\(\(draft\) => draft\.id !== inProgress\?\.id\)/.test(dashboard),
);
check(
  "the working day is the British one, as everywhere else",
  /workingDay\(\)/.test(dashboard) && /workingDay\(\)/.test(storePage),
);

console.log("\n7. What the card actually says");

check("it names the state", /Site Capture in progress/.test(card));
check("the project", /draft\.projectName/.test(card));
check("and where, when the caller knows", /Store \$\{store\.displayCode\}/.test(storePage));
check("the report and its day", /formatReportNumber\(draft\.reportNumber\)/.test(card));
check("how much is in it", /describeCaptureProgress\(draft\)/.test(card));
check("when it was last touched", /describeLastUpdated\(draft\.updatedAt\)/.test(card));
check("Continue Site Capture", /Continue Site Capture/.test(card));
check("and Open project", /Open project/.test(card));

const now = new Date("2026-09-01T10:00:00.000Z");
check("just now", describeLastUpdated("2026-09-01T09:59:40.000Z", now) === "updated just now");
check("minutes", describeLastUpdated("2026-09-01T09:48:00.000Z", now) === "updated 12 minutes ago");
check("one minute", describeLastUpdated("2026-09-01T09:59:00.000Z", now) === "updated 1 minute ago");
check("hours", describeLastUpdated("2026-09-01T07:00:00.000Z", now) === "updated 3 hours ago");
check("yesterday", describeLastUpdated("2026-08-31T09:00:00.000Z", now) === "updated yesterday");
check("days", describeLastUpdated("2026-08-28T09:00:00.000Z", now) === "updated 4 days ago");
check("and nonsense does not crash a screen", describeLastUpdated("not a date", now) === "updated recently");

console.log("\n8. Nothing that was working stopped working");

check("the store still offers directions", /directionsUrl\(store\)/.test(storePage));
check("and Waze", /wazeUrl\(store\)/.test(storePage));
check("a survey can still be started here", /surveys\/new\?directory=/.test(storePage));
check("a store with no projects still says so", /None yet\./.test(storePage));
check(
  "a failed project read still leaves the store details alone",
  /The project list could not be loaded/.test(storePage),
);
check(
  "the project list is still scoped by row-level security alone",
  !/service_role|SERVICE_ROLE/.test(storePage),
);
check("and an issued report still takes no capture", /REPORT_IS_FINAL/.test(captureActions));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL STORE CONTINUITY CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
