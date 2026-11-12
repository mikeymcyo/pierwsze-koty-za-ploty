/**
 * End-to-end test for Phase 3: report capture.
 *
 * Covers starting a draft from a project, the trigger-assigned report number,
 * workforce and plant rows, the verbatim work-completed notes, saving, and the
 * carry-over of workforce and plant into the next report on the same project.
 *
 * Dictation itself is not exercised: the Web Speech API needs a real microphone
 * and a permission grant, so the hook is deliberately kept to an audio-in /
 * text-out contract and the field is tested as the textarea it falls back to.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start      (or point .env.local at a hosted project)
 *   npm run dev
 *
 * Then:
 *   npm run test:reports
 */

import { chromium, devices, webkit } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `reports+${stamp}@example.com`;
const PASSWORD = "SiteBoss!2026";
const COMPANY = `Empire Interiors ${stamp}`;

const PROJECT = {
  name: `Lidl South Croydon - External Works ${stamp}`,
  client: "Lidl GB",
};

const WORKFORCE = { company: "Groundworks Ltd", trade: "Groundworkers", operatives: "6" };
const PLANT = { description: "13t excavator", quantity: "2" };
const NOTES =
  "Continued the drainage run along the eastern boundary. Six groundworkers on site all day.";

const failures = [];
const consoleErrors = [];

function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const TIMEOUT = 60_000;
const iPhoneWebKit = process.argv.includes("--iphone-webkit");
const browser = iPhoneWebKit
  ? await webkit.launch()
  : await chromium.launch({
      args: ["--no-sandbox"],
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    });
const context = await browser.newContext(iPhoneWebKit ? devices["iPhone 15"] : {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);

const missingUrl = BASE + "/reports/00000000-0000-0000-0000-000000000000";
let phase = "sign up";
const failedRequests = [];
function monitorTab(tab) {
  const location = () => `[${phase} at ${new URL(tab.url()).pathname}]`;
  tab.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.location().url === missingUrl && /Failed to load resource:.*404/.test(msg.text())) return;
    consoleErrors.push(`${location()} ${msg.text()}`);
  });
  tab.on("pageerror", (err) => consoleErrors.push(`${location()} pageerror: ${err.name}: ${err.message}`));
  tab.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(BASE).origin) return;
    const type = request.failure()?.errorText.match(/net::ERR_[A-Z_]+|NSURLErrorDomain|cancel(?:led|ed)|abort(?:ed)?|Load failed|\w*Error\b/i)?.[0] ?? "network failure";
    failedRequests.push(`${location()} ${request.method()} ${url.pathname} (${request.resourceType()}, ${type})`);
  });
}
monitorTab(page);

// Next streams server action responses. The replacement editor or issued heading
// can already be visible while the browser is still reading the response body.
async function submitAndFinish(tab, actionUrl, button) {
  await Promise.all([
    tab.waitForEvent("requestfinished", {
      predicate: (request) => request.method() === "POST" && request.url() === actionUrl,
      timeout: TIMEOUT,
    }),
    button.click(),
  ]);
}

const reportUrlPattern = /\/reports\/[0-9a-f-]{36}/;

async function fillCapture({ weather, workforce, plant, notes }) {
  if (weather !== undefined) await page.getByLabel("Weather").fill(weather);
  if (workforce) {
    await page.getByLabel("Company").first().fill(workforce.company);
    await page.getByLabel("Trade").first().fill(workforce.trade);
    await page.getByLabel("No.").first().fill(workforce.operatives);
  }
  if (plant) {
    await page.getByLabel("Plant or equipment").first().fill(plant.description);
    await page.getByLabel("Qty").first().fill(plant.quantity);
  }
  if (notes !== undefined) await page.getByLabel("Work completed").fill(notes);
}

async function testManualReview() {
  const fieldNote = "The south entrance is open again after the paving repair.";
  const manualSummary = "Paving repairs at the south entrance are complete. The entrance has reopened.";

  phase = "start capture";
  await page.getByRole("button", { name: "Start Site Capture" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}\/capture$/, { timeout: TIMEOUT });
  const captureUrl = page.url();
  const reportUrl = captureUrl.replace(/\/capture$/, "");
  const box = page.getByRole("textbox", { name: "What happened on site?" });
  const review = page.getByRole("button", { name: "Review Daily report", exact: true });
  phase = "review unsent note";
  await box.fill(fieldNote);
  await review.click();
  await page.waitForURL(reportUrl, { timeout: TIMEOUT });
  const notes = page.getByRole("textbox", { name: "Work completed", exact: true });
  const rawNotes = await notes.inputValue();
  check("review saved the unsent note exactly once", rawNotes.replace(/^\[\d{2}:\d{2}\] /, "") === fieldNote, rawNotes);

  const summary = page.getByRole("textbox", { name: "Daily Summary", exact: true });
  const summaryForm = page.locator("form").filter({ has: summary });
  const editorBadge = summaryForm.getByText("Edited by you", { exact: true });
  check("the manual summary starts empty", (await summary.inputValue()) === "");
  check("manual review offers no AI writer", (await page.getByRole("button", { name: /Write my report|Rewrite from my notes/ }).count()) === 0);
  phase = "save Daily Summary";
  await summary.fill(manualSummary);
  await submitAndFinish(page, reportUrl, summaryForm.getByRole("button", { name: "Save this section", exact: true }));
  await editorBadge.waitFor({ timeout: TIMEOUT });
  phase = "reload saved report";
  await page.reload();
  check("the saved summary survives a reload", (await summary.inputValue()) === manualSummary);
  check("the original field note survives editing the summary", (await notes.inputValue()) === rawNotes);
  check("the summary is attributed to the editor", await editorBadge.isVisible());

  // Simulate a second device issuing this report while the capture is still open.
  phase = "return to capture";
  await page.getByRole("main").getByRole("link", { name: "Site Capture", exact: true }).click();
  await page.waitForURL(captureUrl);
  check("the confirmed note has left the capture box", (await box.inputValue()) === "");
  const lateNote = "The supervisor has just signed the handover sheet.";
  await box.fill(lateNote);
  phase = "issue report on second tab";
  const otherTab = await context.newPage();
  monitorTab(otherTab);
  try {
    await otherTab.goto(reportUrl);
    await submitAndFinish(otherTab, reportUrl, otherTab.getByRole("button", { name: "Finalise report", exact: true }));
    await otherTab.getByRole("heading", { name: "Issued report", exact: true }).waitFor({ timeout: TIMEOUT });
    phase = "save note on issued report";
    await submitAndFinish(page, captureUrl, review);
    await page.getByRole("alert").filter({ hasText: "This report has been finalised" }).waitFor();
    check("a refused save keeps the capture open with the unsent note", page.url() === captureUrl && (await box.inputValue()) === lateNote);
  } finally {
    await otherTab.close();
  }
}

async function runReports() {
  console.log("\n1. Sign up and create a project");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(COMPANY);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  // The URL can change before the dashboard's signed-in layout finishes streaming.
  phase = "open project form from dashboard";
  await page.getByRole("main").getByRole("link", { name: "Create project", exact: true }).click();
  await page.waitForURL("**/projects/new", { timeout: TIMEOUT });
  phase = "create project";
  await page.getByLabel("Project name").fill(PROJECT.name);
  await page.getByLabel("Client").fill(PROJECT.client);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const projectUrl = page.url();
  check("project created", true);
  if (process.argv.includes("--manual-review")) return testManualReview();

  console.log("\n2. The project page offers a real New report action");
  const newReport = page.getByRole("button", { name: "Start Site Capture" });
  await newReport.waitFor();
  check("Start Site Capture is available", await newReport.isVisible());

  console.log("\n3. Starting a report opens a numbered draft");
  await newReport.click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
  await page.goto(page.url().replace(/\/capture$/, ""));
  await page.getByRole("heading", { name: /^Report 001$/ }).waitFor({ timeout: TIMEOUT });
  const firstReportUrl = page.url();
  check("first report is numbered 001 by the database trigger", true);
  check("shows the author name", await page.getByText("Maciej Korzeniak").isVisible());
  check("shows a Draft badge", await page.getByText("Draft", { exact: true }).isVisible());

  const dateValue = await page.getByLabel("Date", { exact: true }).inputValue();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  check("date is pre-filled with today", dateValue === today, dateValue);

  console.log("\n4. Dictation degrades to a usable field");
  const notesBox = page.getByLabel("Work completed");
  check("work completed field is present and editable", await notesBox.isEditable());

  console.log("\n5. Fill and save the draft");
  await page.getByText("Date, weather, workforce and plant", { exact: true }).click();
  // Once the first draft belongs to yesterday, starting today creates a new Daily.
  const previousDay = new Date(dateValue);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  await page.getByLabel("Date", { exact: true }).fill(previousDay.toISOString().slice(0, 10));
  await fillCapture({
    weather: "Dry, 12C, windy",
    workforce: WORKFORCE,
    plant: PLANT,
    notes: NOTES,
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.").waitFor({ timeout: TIMEOUT });
  check("saving confirms in the UI", true);

  console.log("\n6. Values survive a reload");
  await page.goto(firstReportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("heading", { name: /^Report 001$/ }).waitFor({ timeout: TIMEOUT });
  check("weather persisted", (await page.getByLabel("Weather").inputValue()) === "Dry, 12C, windy");
  check(
    "workforce company persisted",
    (await page.getByLabel("Company").first().inputValue()) === WORKFORCE.company,
  );
  check(
    "workforce count persisted",
    (await page.getByLabel("No.").first().inputValue()) === WORKFORCE.operatives,
  );
  check(
    "plant persisted",
    (await page.getByLabel("Plant or equipment").first().inputValue()) === PLANT.description,
  );
  check(
    "notes stored verbatim",
    (await page.getByLabel("Work completed").inputValue()) === NOTES,
    "raw_notes must match what was typed, character for character",
  );

  console.log("\n7. The report is listed everywhere it should be");
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("heading", { name: "Reports", exact: true }).waitFor({ timeout: TIMEOUT });
  await page.getByText("Report 001").first().waitFor({ timeout: TIMEOUT });
  check("appears on the reports list", true);

  await page.getByText("Report 001").first().click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
  check("reports list links back into the report", true);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  // Wait rather than sample: goto resolves before the dashboard's queries have
  // rendered, and an immediate read makes this check intermittently fail.
  await page.getByText("Report 001").first().waitFor({ timeout: TIMEOUT });
  check("appears on the dashboard", true);

  console.log("\n8. A second report numbers up and carries the crew over");
  await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "Start Site Capture" }).click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
  await page.goto(page.url().replace(/\/capture$/, ""));
  await page.getByRole("heading", { name: /^Report 002$/ }).waitFor({ timeout: TIMEOUT });
  const secondReportUrl = page.url();
  check("second report is numbered 002", true);
  check(
    "workforce carried over from the previous report",
    (await page.getByLabel("Company").first().inputValue()) === WORKFORCE.company,
  );
  check(
    "plant carried over from the previous report",
    (await page.getByLabel("Plant or equipment").first().inputValue()) === PLANT.description,
  );
  check(
    "notes did NOT carry over",
    (await page.getByLabel("Work completed").inputValue()) === "",
    "each day's notes must start blank",
  );

  console.log("\n9. Rows can be added and removed");
  await page.getByText("Date, weather, workforce and plant", { exact: true }).click();
  await page.getByRole("button", { name: "Add company" }).click();
  const companyCount = await page.getByLabel("Company").count();
  check("adding a workforce row works", companyCount === 2, `saw ${companyCount}`);
  await page.getByRole("button", { name: /Remove workforce row 2/ }).click();
  const afterRemove = await page.getByLabel("Company").count();
  check("removing a workforce row works", afterRemove === 1, `saw ${afterRemove}`);

  console.log("\n10. A draft can be deleted");
  await page.goto(secondReportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "Delete this draft" }).click();
  await page.getByRole("button", { name: "Delete report", exact: true }).click();
  await page.waitForURL("**/reports", { timeout: TIMEOUT });
  const stillThere = await page.getByText("Report 002").count();
  check("deleted draft is gone from the list", stillThere === 0, `saw ${stillThere}`);
  check("the first report survived", (await page.getByText("Report 001").count()) > 0);

  console.log("\n11. An unknown report id 404s rather than erroring");
  await page.goto(missingUrl, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("unknown report id shows the not-found page", true);
}

try {
  await runReports();
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
}

const realErrors = consoleErrors.filter((m) => !/favicon|React DevTools/i.test(m));

console.log("\n=== Console errors ===");
console.log(realErrors.length ? realErrors.map((e) => `  ${e}`).join("\n") : "  none");

console.log("\n=== Result ===");
if (failures.length === 0 && realErrors.length === 0) {
  console.log("ALL REPORT CHECKS PASSED");
} else {
  for (const request of failedRequests) console.log(`FAILED REQUEST: ${request}`);
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
