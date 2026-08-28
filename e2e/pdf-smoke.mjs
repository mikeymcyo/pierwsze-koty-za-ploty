/**
 * End-to-end test for Phase 6: issues and the issued PDF.
 *
 * Covers the two things only a real database can answer - that an issue raised
 * on a report reaches the project's Open Issues tab, and that finalising
 * produces a stored PDF after which the report genuinely stops changing.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start
 *   npm run dev
 *
 * Then:
 *   npm run test:pdf
 */

import { chromium } from "playwright";
import { Buffer } from "node:buffer";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const PASSWORD = "SiteBoss!2026";
const NOTES =
  "Signage installed to the front elevation with chemical anchors. Made good and repainted the side elevation.";

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

const PNG_2X2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  console.log("\n1. Sign up, project, report with notes and a photo");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(`Empire Interiors ${stamp}`);
  await page.getByLabel("Email").fill(`pdf+${stamp}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(`Lidl South Croydon ${stamp}`);
  await page.getByLabel("Client").fill("Lidl GB");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const projectUrl = page.url();

  await page.getByRole("button", { name: "New report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const reportUrl = page.url();

  await page.getByLabel("Work completed").fill(NOTES);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.").waitFor({ timeout: TIMEOUT });

  await page.locator('input[data-photo-source="library"]').setInputFiles({
    name: "site.png",
    mimeType: "image/png",
    buffer: PNG_2X2,
  });
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });

  console.log("\n2. An issue can be raised from the report");
  await page.getByRole("button", { name: "Raise issue" }).click();
  const title = `Drainage blocked ${stamp}`;
  await page.getByLabel("What is the issue").fill(title);
  await page.getByLabel("Detail").fill("Materials stored over the run.");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("Responsible").fill("Groundworks Ltd");
  await page.getByRole("button", { name: "Raise issue" }).click();
  await page.getByText(/Issue raised/i).waitFor({ timeout: TIMEOUT });
  check("raising an issue keeps the site manager on the report", page.url() === reportUrl);

  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check(
    "it is listed on the report it was raised from",
    (await page.locator("main").innerText()).includes(title),
  );

  console.log("\n3. It appears under Project - Open Issues");
  await page.goto(`${projectUrl}?tab=issues`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  const projectIssues = await page.locator("main").innerText();
  check("the issue is on the project tab", projectIssues.includes(title));
  check("with its priority", /High/.test(projectIssues));
  check("and who it sits with", projectIssues.includes("Groundworks Ltd"));

  console.log("\n4. Status moves in one tap, and closed issues stay reachable");
  await page.getByRole("button", { name: "Mark in progress" }).first().click();
  await page.getByText("In progress").first().waitFor({ timeout: TIMEOUT });
  check("an issue can be moved to in progress", true);

  await page.getByRole("button", { name: "Close" }).first().click();
  await page.waitForTimeout(1500);
  await page.goto(`${projectUrl}?tab=issues`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check(
    "a closed issue leaves the open list",
    !(await page.locator("main").innerText()).includes(title),
  );

  await page.getByRole("link", { name: /Show closed issues too/ }).click();
  await page.waitForLoadState("domcontentloaded");
  check(
    "but is still reachable",
    (await page.locator("main").innerText()).includes(title),
    "an issue nobody can look at again is a record nobody trusts",
  );

  console.log("\n5. An issue can be raised on the project with no report");
  await page.goto(`${projectUrl}?tab=issues`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "Raise issue" }).click();
  const projectOnly = `Hoarding damaged ${stamp}`;
  await page.getByLabel("What is the issue").fill(projectOnly);
  await page.getByRole("button", { name: "Raise issue" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${projectUrl}?tab=issues`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check(
    "issues.report_id is nullable, so this works",
    (await page.locator("main").innerText()).includes(projectOnly),
  );

  console.log("\n6. A draft can be previewed without being issued");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  const preview = await page.request.get(`${reportUrl}/preview`);
  check("the preview renders a PDF", preview.headers()["content-type"]?.includes("application/pdf"));
  const previewBody = await preview.body();
  check("which really is one", previewBody.subarray(0, 5).toString() === "%PDF-");
  check(
    "previewing does not finalise anything",
    (await page.locator("main").innerText()).includes("Draft"),
  );

  console.log("\n7. Finalising issues the report");
  await page.getByRole("button", { name: "Finalise report" }).click();
  await page.getByText(/issued/i).first().waitFor({ timeout: TIMEOUT });
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  const afterFinal = await page.locator("main").innerText();

  check("the report is marked final", afterFinal.includes("Final"));
  check("the issued PDF is offered", await page.getByRole("link", { name: /Open the PDF/ }).isVisible());
  check(
    "the capture form is gone",
    (await page.getByLabel("Work completed").count()) === 0,
    "an issued report is not edited",
  );
  check(
    "so is the photo uploader",
    (await page.locator('input[data-photo-source="library"]').count()) === 0,
  );
  check(
    "and so is drafting",
    (await page.getByRole("button", { name: /Rewrite from my notes|Write my report/ }).count()) === 0,
  );

  const pdfHref = await page.getByRole("link", { name: /Open the PDF/ }).getAttribute("href");
  check("the PDF is served by a signed URL, not a public one", Boolean(pdfHref?.includes("token=")), String(pdfHref).slice(0, 90));

  const stored = await page.request.get(pdfHref);
  const storedBody = await stored.body();
  check("and the stored file is a PDF", storedBody.subarray(0, 5).toString() === "%PDF-");
  check("with real content in it", storedBody.length > 1000, `${storedBody.length} bytes`);

  console.log("\n8. An issued report does not change");
  const previewAfter = await page.request.get(`${reportUrl}/preview`);
  check(
    "the draft preview refuses once issued",
    previewAfter.status() === 409,
    `status ${previewAfter.status()}`,
  );
  check(
    "the report cannot be deleted either",
    (await page.getByRole("button", { name: /Delete this draft/ }).count()) === 0,
  );

  // The issue raised against it is still tracked - issues outlive the report.
  await page.goto(`${projectUrl}?tab=issues&closed=1`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  check(
    "issues raised on it survive finalisation",
    (await page.locator("main").innerText()).includes(title),
  );
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
  console.log("ALL PDF AND ISSUE CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
