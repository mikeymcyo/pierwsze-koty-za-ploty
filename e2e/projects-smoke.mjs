/**
 * End-to-end test for Phase 2: projects CRUD and the project detail screen.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start      (or point .env.local at a hosted project)
 *   npm run dev
 *
 * Then:
 *   npm run test:projects
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `projects+${stamp}@example.com`;
const PASSWORD = "SiteBoss!2026";
const COMPANY = `Empire Interiors ${stamp}`;

const PROJECT = {
  name: `Lidl South Croydon - External Works ${stamp}`,
  client: "Lidl GB",
  address: "South Croydon",
  postcode: "CR2 6EA",
  reference: "1470",
  manager: "Maciej",
};

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

try {
  console.log("\n1. Sign up");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(COMPANY);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });
  await page.getByRole("heading", { name: /Hello,/ }).waitFor({ timeout: TIMEOUT });
  check("reaches the dashboard", true);

  console.log("\n2. Empty state offers project creation");
  const firstProjectCta = page.getByRole("link", { name: "Create your first project" });
  check("dashboard shows a real create action", await firstProjectCta.isVisible());

  console.log("\n3. Create a project");
  await firstProjectCta.click();
  await page.waitForURL("**/projects/new", { timeout: TIMEOUT });
  await page.getByRole("heading", { name: "New project" }).waitFor({ timeout: TIMEOUT });

  await page.getByLabel("Project name").fill(PROJECT.name);
  await page.getByLabel("Client").fill(PROJECT.client);
  await page.getByLabel("Site address").fill(PROJECT.address);
  await page.getByLabel("Postcode").fill(PROJECT.postcode);
  await page.getByLabel("Project reference").fill(PROJECT.reference);
  await page.getByLabel("Site manager").fill(PROJECT.manager);
  await page.getByLabel("Start date").fill("2026-08-01");
  await page.getByLabel("Expected completion").fill("2026-12-18");
  await page.getByRole("button", { name: "Create project" }).click();

  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  await page.getByRole("heading", { name: PROJECT.name }).waitFor({ timeout: TIMEOUT });
  const projectUrl = page.url();
  check("lands on the new project's page", /\/projects\/[0-9a-f-]{36}$/.test(projectUrl));
  check("shows the client and address", await page.getByText("Lidl GB · South Croydon").isVisible());
  check("shows the Active status", await page.getByText("Active", { exact: true }).isVisible());

  console.log("\n4. Overview tab shows what was entered");
  for (const [label, value] of [
    ["reference", PROJECT.reference],
    ["site manager", PROJECT.manager],
    ["postcode", PROJECT.postcode],
  ]) {
    check(`overview shows the ${label}`, await page.getByText(value, { exact: true }).first().isVisible());
  }
  check("formats the start date", await page.getByText("1 August 2026").isVisible());

  console.log("\n5. The other three tabs load with honest empty states");
  // Scoped to the tab strip: "Reports" also names a bottom-nav destination.
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  for (const [tab, expected] of [
    ["Reports", "No reports yet"],
    ["Photos", "No photos yet"],
    ["Open Issues", "No open issues"],
  ]) {
    await tabs.getByRole("link", { name: tab, exact: true }).click();
    await page.getByText(expected).waitFor({ timeout: TIMEOUT });
    check(`${tab} tab renders`, true);
  }

  console.log("\n6. Tab selection survives a reload");
  const photosUrl = `${projectUrl}?tab=photos`;
  await page.goto(photosUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByText("No photos yet").waitFor({ timeout: TIMEOUT });
  check("?tab= is honoured on a fresh load", true);

  console.log("\n7. Edit the project");
  await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("link", { name: "Edit project" }).click();
  await page.waitForURL("**/edit", { timeout: TIMEOUT });
  await page.getByRole("heading", { name: "Edit project" }).waitFor({ timeout: TIMEOUT });

  check(
    "form is pre-filled with existing values",
    (await page.getByLabel("Client").inputValue()) === PROJECT.client,
  );

  await page.getByLabel("Client").fill("Lidl Great Britain Ltd");
  await page.getByLabel("Status").selectOption("on_hold");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: TIMEOUT });
  await page.getByText("Lidl Great Britain Ltd · South Croydon").waitFor({ timeout: TIMEOUT });
  check("edited client is saved", true);
  check("status changed to On hold", await page.getByText("On hold").isVisible());

  console.log("\n8. Validation is enforced server-side");
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  // A single character satisfies the browser's own "required" check but fails
  // the server's minimum length, so this reaches the server action without
  // tampering with the DOM.
  await page.getByLabel("Project name").fill("x");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByText("Give the project a name").waitFor({ timeout: TIMEOUT });
  check("rejects a too-short name", true);

  await page.getByLabel("Project name").fill("Date order check");
  await page.getByLabel("Start date").fill("2026-12-01");
  await page.getByLabel("Expected completion").fill("2026-01-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByText("Completion cannot be before the start date").waitFor({ timeout: TIMEOUT });
  check("rejects completion before start", true);

  console.log("\n9. Project appears in the list and on the dashboard");
  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor({ timeout: TIMEOUT });
  check("listed on the projects page", await page.getByText(PROJECT.name).isVisible());

  await page.getByText(PROJECT.name).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  check("list item links to the detail page", true);

  console.log("\n10. A missing project 404s rather than erroring");
  await page.goto(`${BASE}/projects/00000000-0000-0000-0000-000000000000`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("unknown project id shows the not-found page", true);
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
  console.log("ALL PROJECT CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
