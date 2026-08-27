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

import { chromium } from "playwright";

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
const launchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

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

try {
  console.log("\n1. Sign up and create a project");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(COMPANY);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(PROJECT.name);
  await page.getByLabel("Client").fill(PROJECT.client);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const projectUrl = page.url();
  check("project created", true);

  console.log("\n2. The project page offers a real New report action");
  const newReport = page.getByRole("button", { name: "New report" });
  check("New report button is present", await newReport.isVisible());

  console.log("\n3. Starting a report opens a numbered draft");
  await newReport.click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
  await page.getByRole("heading", { name: /^Report 001$/ }).waitFor({ timeout: TIMEOUT });
  const firstReportUrl = page.url();
  check("first report is numbered 001 by the database trigger", true);
  check("shows the author name", await page.getByText("Maciej Korzeniak").isVisible());
  check("shows a Draft badge", await page.getByText("Draft", { exact: true }).isVisible());

  const dateValue = await page.getByLabel("Date").inputValue();
  check("date is pre-filled with today", /^\d{4}-\d{2}-\d{2}$/.test(dateValue), dateValue);

  console.log("\n4. Dictation degrades to a usable field");
  const notesBox = page.getByLabel("Work completed");
  check("work completed field is present and editable", await notesBox.isEditable());

  console.log("\n5. Fill and save the draft");
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
  check("appears on the reports list", await page.getByText("Report 001").first().isVisible());

  await page.getByText("Report 001").first().click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
  check("reports list links back into the report", true);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check("appears on the dashboard", await page.getByText("Report 001").first().isVisible());

  console.log("\n8. A second report numbers up and carries the crew over");
  await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "New report" }).click();
  await page.waitForURL(reportUrlPattern, { timeout: TIMEOUT });
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
  await page.getByRole("button", { name: "Add company" }).click();
  const companyCount = await page.getByLabel("Company").count();
  check("adding a workforce row works", companyCount === 2, `saw ${companyCount}`);
  await page.getByRole("button", { name: /Remove workforce row 2/ }).click();
  const afterRemove = await page.getByLabel("Company").count();
  check("removing a workforce row works", afterRemove === 1, `saw ${afterRemove}`);

  console.log("\n10. A draft can be deleted");
  await page.goto(secondReportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "Delete this draft" }).click();
  await page.waitForURL("**/reports", { timeout: TIMEOUT });
  const stillThere = await page.getByText("Report 002").count();
  check("deleted draft is gone from the list", stillThere === 0, `saw ${stillThere}`);
  check("the first report survived", (await page.getByText("Report 001").count()) > 0);

  console.log("\n11. An unknown report id 404s rather than erroring");
  await page.goto(`${BASE}/reports/00000000-0000-0000-0000-000000000000`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("unknown report id shows the not-found page", true);
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
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
