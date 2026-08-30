/**
 * Getting around, and getting at a project's actions.
 *
 * The swipe arithmetic and what a card says are pure and tested directly. The
 * rest is a structural guard on the two things that must never regress: a
 * gesture can never delete anything on its own, and everything the gesture
 * offers is reachable without it.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  ACTIONS_WIDTH,
  INTENT_THRESHOLD,
  OPEN_THRESHOLD,
  swipeIntent,
  swipeOffset,
  swipeSettlesOpen,
} from "../lib/ui/swipe.ts";
import {
  openIssueLabel,
  projectSubtitle,
  tallyOpenIssues,
} from "../lib/projects/row-summary.ts";
import { MOBILE_NAV_ITEMS, NAV_ITEMS, isNavItemActive } from "../lib/navigation.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

console.log("\n1. A scroll is never mistaken for a swipe");
check("a still finger has decided nothing", swipeIntent(0, 0) === "undecided");
check("nor has a twitch", swipeIntent(4, 3) === "undecided");
check("a flat drag sideways is a swipe", swipeIntent(-40, 2) === "horizontal");
check("a drag down the page is a scroll", swipeIntent(-4, 40) === "vertical");
check("and so is a diagonal one", swipeIntent(-30, 30) === "vertical");
check("a mostly-sideways diagonal is still a swipe", swipeIntent(-60, 20) === "horizontal");
check(
  "vertical wins the tie, because a stuck list is worse than a missed swipe",
  swipeIntent(-30, 25) === "vertical",
);
check("the threshold is small enough to feel immediate", INTENT_THRESHOLD <= 12);

console.log("\n2. The row goes where the finger takes it, and no further");
check("a closed row does not move right", swipeOffset(60, false) === 0);
check("it follows a leftward drag", swipeOffset(-40, false) === -40);
check("and stops at the actions", swipeOffset(-400, false) === -ACTIONS_WIDTH);
check("an open row starts from where it is", swipeOffset(0, true) === -ACTIONS_WIDTH);
check("and can be pushed shut", swipeOffset(ACTIONS_WIDTH, true) === 0);
check("but not past shut", swipeOffset(400, true) === 0);
check("the actions are two comfortable targets wide", ACTIONS_WIDTH >= 140);

console.log("\n3. A half-hearted swipe springs back");
check("a small drag does not leave Delete showing", !swipeSettlesOpen(-20, false));
check("a committed drag does", swipeSettlesOpen(-(OPEN_THRESHOLD + 1), false));
check("a nudge on an open row does not slam it shut", swipeSettlesOpen(-(ACTIONS_WIDTH - 10), true));
check("a real push does", !swipeSettlesOpen(-20, true));
check("the open threshold is a deliberate movement", OPEN_THRESHOLD >= 40);

console.log("\n4. What a card actually says");
const project = {
  name: "Replacement hoarding",
  client: "Lidl GB",
  site_address: "14 Wharf Road, South Croydon",
  project_reference: "EI-2026-114",
};
check(
  "client and address, when there is no store",
  projectSubtitle(project, null) === "Lidl GB · 14 Wharf Road, South Croydon",
);
check(
  "the store replaces the address rather than joining it",
  projectSubtitle(project, { displayName: "South Croydon", displayCode: "1470" }) ===
    "Lidl GB · South Croydon · 1470",
);
check(
  "a project with neither says nothing rather than printing dashes",
  projectSubtitle({ name: "x", client: null, site_address: null, project_reference: null }, null) ===
    null,
);
check(
  "whitespace is not information",
  projectSubtitle({ name: "x", client: "  ", site_address: "  ", project_reference: null }, null) ===
    null,
);
check("no open issues is not worth a line", openIssueLabel(0) === null);
check("nor is a negative one", openIssueLabel(-1) === null);
check("one reads as one", openIssueLabel(1) === "1 open issue");
check("several read as several", openIssueLabel(4) === "4 open issues");
const tally = tallyOpenIssues([
  { project_id: "a" },
  { project_id: "a" },
  { project_id: "b" },
]);
check("issues are tallied per project", tally.get("a") === 2 && tally.get("b") === 1);
check("a project with none is simply absent", tally.get("c") === undefined);

console.log("\n5. A swipe cannot delete anything");
const rows = {
  project: read("../components/projects/project-row.tsx"),
  daily: read("../components/reports/report-row.tsx"),
  consolidated: read("../components/summary-reports/summary-row.tsx"),
};
// Deletion is never reimplemented: every row hands off to the component that
// already owns that confirmation, its wording and its server-side checks.
for (const [name, component, owner] of [
  ["project", rows.project, "DeleteProject"],
  ["daily", rows.daily, "DeleteReport"],
  ["consolidated", rows.consolidated, "DeleteSummaryReport"],
]) {
  check(`${name}: Delete goes through the existing ${owner}`, new RegExp(`<${owner}\\b`).test(component));
  check(`${name}: no deletion action is called directly`, !/\.bind\(null,/.test(component));
  check(`${name}: the swipe opens a confirmation rather than deleting`, /setConfirming\(true\)/.test(component));
  check(`${name}: which arrives already open`, /defaultOpen/.test(component));
  check(`${name}: cancelling puts the row back`, /onCancel=\{\(\) => setConfirming\(false\)\}/.test(component));
}
check(
  "an issued record still has to have the word typed",
  /requireTyping=\{isFinal\}/.test(read("../components/reports/report-lifecycle.tsx")) &&
    /requireTyping=\{isFinal\}/.test(read("../components/summary-reports/summary-lifecycle.tsx")),
);
check(
  "reopening an issued report is not offered behind a swipe",
  !/<ReopenReport/.test(rows.daily) && !/<ReopenSummaryReport/.test(rows.consolidated),
);
check(
  "a draft is edited and an issued report is opened",
  /isFinal \? "Open" : "Edit"/.test(rows.daily) && /isFinal \? "Open" : "Edit"/.test(rows.consolidated),
);

console.log("\n6. Nothing depends on knowing the gesture");
const swipe = read("../components/ui/swipe-row.tsx");
check("there is one row component, not three", /export function SwipeRow/.test(swipe));
for (const [name, component] of Object.entries(rows)) {
  check(`${name}: uses it rather than its own gesture`, /<SwipeRow/.test(component));
  check(`${name}: and carries no gesture code of its own`, !/pointerType|touchAction/.test(component));
}
check("there is a menu button as well", /aria-label=\{`Actions for \$\{label\}`\}/.test(swipe));
check("it says whether it is open", /aria-expanded=\{revealed\}/.test(swipe));
check("it toggles the same actions the swipe reveals", /setRevealed\(\(open\) => !open\)/.test(swipe));
check("a mouse drag is not a swipe", /event\.pointerType !== "touch"/.test(swipe));
check("the browser is told it keeps vertical scrolling", /touchAction: "pan-y"/.test(swipe));
check(
  "the actions are not in the page while the row is closed",
  /\{revealed \? \(\s*<div className="absolute/.test(swipe),
);
check(
  "the project list says the actions are there",
  /Swipe a project left, or use its menu/.test(read("../app/(app)/projects/page.tsx")),
);
check(
  "and so does the report list",
  /Swipe a report left, or use its menu/.test(read("../app/(app)/reports/page.tsx")),
);

console.log("\n7. Getting around");
check("the dashboard is first", NAV_ITEMS[0].href === "/dashboard");
check("Create is the raised action", NAV_ITEMS.find((item) => item.primary)?.href === "/reports/new");
check("the phone bar carries five, so Create stays centred", MOBILE_NAV_ITEMS.length === 5);
check(
  "and Create is the middle one",
  MOBILE_NAV_ITEMS[Math.floor(MOBILE_NAV_ITEMS.length / 2)].primary === true,
);
check("Stores is one tap away", MOBILE_NAV_ITEMS.some((item) => item.href === "/stores"));
check("Profile is reachable but out of the way", NAV_ITEMS.some((item) => item.href === "/profile"));
check(
  // The gear became its own component when it started carrying the screen it
  // was opened from, so the href is built rather than written out here.
  "and it is in the top bar instead",
  /<SettingsLink\s*\/>/.test(read("../components/nav/top-bar.tsx")) &&
    /settingsHref\(pathname\)/.test(read("../components/nav/settings-link.tsx")),
);
const tab = (href) => NAV_ITEMS.find((item) => item.href === href);
check("a report lights up Reports", isNavItemActive(tab("/reports"), "/reports/abc"));
check("a consolidated report lights it up too", isNavItemActive(tab("/reports"), "/summary-reports/abc"));
check("but the Create button does not", !isNavItemActive(tab("/reports"), "/reports/new"));
check("a store lights up Stores", isNavItemActive(tab("/stores"), "/stores/1470"));
check("and not Reports", !isNavItemActive(tab("/reports"), "/stores/1470"));
check("a project lights up Projects", isNavItemActive(tab("/projects"), "/projects/abc/edit"));

console.log("\n8. Back means up a level, in the same place every time");
const back = read("../components/ui/back-link.tsx");
check("there is one component for it", /export function BackLink/.test(back));
check("it goes to a known parent rather than into history", !/router\.back|history\./.test(back));
check("it is a comfortable target", /min-h-11/.test(back));
for (const [name, file, href] of [
  ["the project page", "../app/(app)/projects/[id]/page.tsx", '/projects'],
  ["the store page", "../app/(app)/stores/[code]/page.tsx", '/stores'],
]) {
  check(`${name} uses it`, new RegExp(`<BackLink href="${href}"`).test(read(file)));
}

console.log("\n9. The dashboard leads with the work");
const dashboard = read("../app/(app)/dashboard/page.tsx");
for (const [what, pattern] of [
  ["a daily report", /href="\/reports\/new"/],
  ["a new project", /href="\/projects\/new"/],
  ["the store locator", /href="\/stores"/],
  ["drafts to finish", /status", "draft"/],
  ["issues that need attention", /\.neq\("status", "closed"\)/],
  ["only the serious ones", /\["critical", "high"\]/],
]) {
  check(`it offers ${what}`, pattern.test(dashboard), String(pattern));
}
check(
  "a failed extra query hides its section rather than the page",
  /draftsResult\.data \?\? \[\]/.test(dashboard) && !/draftsResult\.error/.test(dashboard),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL NAVIGATION CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
