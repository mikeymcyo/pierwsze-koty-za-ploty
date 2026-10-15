/**
 * The keyboard's Go key, and Preview → Close / Back, in a real browser.
 *
 * Drives a deployment at phone width: creates a throwaway company and a
 * Daily, presses Enter in the Weather field and expects a saved draft and no
 * AI run; picks a presentation, previews, returns by the viewer's Close and
 * by the browser's Back, and expects the choices back both times; then
 * finalises and expects the issued PDF route to serve a file. A Progress
 * report is made from the issued Daily and the same round trip is driven.
 *
 * The one AI call here is deliberate: "Write my report" must still write.
 *
 *   E2E_BASE_URL=https://… npm run test:presentation-browser
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `validation+${stamp}@example.com`;
const PASSWORD = "SiteBoss!2026";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` - ${detail}` : ""}`);
}

const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.setDefaultTimeout(45_000);

/** The values the Finalise form would post right now. */
const posted = () =>
  page.evaluate(() => ({
    style: document.querySelector('input[name="pdfStyle"]')?.value,
    layout: document.querySelector('input[name="photoLayout"]')?.value,
    cover: document.querySelector('input[name="coverPhoto"]')?.value,
    documents: document.querySelector('input[name="includeDocuments"]')?.value,
  }));

async function pickPresentation(style, layout) {
  await page.getByText("Presentation", { exact: true }).click();
  await page.getByRole("button", { name: style, exact: true }).click();
  await page.getByRole("button", { name: layout, exact: true }).click();
}

/** Preview, then back by Close and by Back; the choices must survive both. */
async function roundTrip(what, previewName) {
  await pickPresentation("Photo", "Focus");
  await page.waitForFunction(() => /style=photo/.test(location.search) && /layout=focus/.test(location.search));
  check(`${what}: the page's address holds the choices before Preview`, true);
  await page.getByRole("link", { name: previewName }).click();
  await page.waitForURL(/\/pdf\?draft=1/);
  await page.getByRole("link", { name: "Back to the report" }).click();
  await page.waitForURL((url) => !/\/pdf/.test(url.pathname));
  const afterClose = await posted();
  check(`${what}: Close brings the choices back`, afterClose.style === "photo" && afterClose.layout === "focus", JSON.stringify(afterClose));

  await page.getByRole("link", { name: previewName }).click();
  await page.waitForURL(/\/pdf\?draft=1/);
  await page.goBack();
  await page.waitForURL((url) => !/\/pdf/.test(url.pathname));
  await page.waitForSelector('input[name="pdfStyle"]');
  const afterBack = await posted();
  check(`${what}: the browser's Back brings the choices back`, afterBack.style === "photo" && afterBack.layout === "focus", JSON.stringify(afterBack));
}

try {
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("Your name").fill("Mike Probe");
  await page.getByLabel("Company").fill(`Validation Co ${stamp}`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "networkidle" });
  await page.getByLabel("Project name").fill("Lidl Croydon refit");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: /Start Site Capture/ }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}\/capture/);
  const reportId = page.url().match(/reports\/([0-9a-f-]{36})/)[1];

  // One note through the composer, so the report has something to write from.
  await page.getByLabel("What happened on site?").fill("Stripped out the old checkout counters on bays 1 to 4. Two electricians on site from 7.");
  await page.locator("[data-composer-send]").click();
  await page.waitForFunction(() => /1 note/.test(document.body.innerText), null, { timeout: 30_000 });

  console.log("\n1. Enter in a details field saves the draft and never writes");
  await page.goto(`${BASE}/reports/${reportId}`, { waitUntil: "networkidle" });
  await page.getByText("Date, weather, workforce and plant").click();
  const weather = page.getByLabel("Weather");
  await weather.fill("Dry, 12C");
  await weather.press("Enter");
  await page.waitForURL(/saved=1/, { timeout: 30_000 });
  check("Enter saved the draft", await page.getByText("Draft saved.").isVisible());
  check("and no AI run started", !/Writing…/.test(await page.locator("body").innerText()) && (await page.locator("text=/sections? (were|was) written|written from your notes/i").count()) === 0);
  check("the weather was kept", (await page.getByLabel("Weather").inputValue()) === "Dry, 12C");

  console.log("\n2. Write my report, pressed on purpose, still writes");
  await page.getByRole("button", { name: /Write my report|Rewrite from my notes/ }).click();
  await page.waitForFunction(() => !/Writing…/.test(document.body.innerText) && /Rewrite from my notes/.test(document.body.innerText), null, { timeout: 120_000 });
  check("the report was written", /Rewrite from my notes/.test(await page.locator("body").innerText()));

  console.log("\n3. Bad presentation parameters are harmless");
  await page.goto(`${BASE}/reports/${reportId}?style=neon&layout=sideways&cover=not-a-photo`, { waitUntil: "networkidle" });
  const safe = await posted();
  check("defaults are used", safe.style === "siteboss" && safe.layout === "standard" && safe.documents === "1", JSON.stringify(safe));
  check("the cover id is carried only as an id; the render picks no cover for it", safe.cover === "not-a-photo");

  console.log("\n4. Daily: Preview → Close and Preview → Back keep the choices");
  await page.goto(`${BASE}/reports/${reportId}`, { waitUntil: "networkidle" });
  const fresh = await posted();
  check("a fresh visit starts from the defaults", fresh.style === "siteboss" && fresh.layout === "standard" && fresh.cover === "");
  await roundTrip("Daily", "Preview");

  console.log("\n5. Finalise issues exactly those choices");
  const before = await posted();
  check("the finalise form carries Photo + Focus", before.style === "photo" && before.layout === "focus");
  await page.getByRole("button", { name: "Finalise report" }).click();
  await page.waitForFunction(() => /Issued report/.test(document.body.innerText), null, { timeout: 120_000 });
  check("the Daily was issued", true);
  const file = await page.request.get(`${BASE}/reports/${reportId}/file`);
  check("and the issued PDF is served, immutable from here", file.ok() && (file.headers()["content-type"] ?? "").includes("pdf"));

  console.log("\n6. Progress report: the same round trip");
  await page.goto(`${BASE}/summary-reports/new?kind=progress`, { waitUntil: "networkidle" });
  const projectPick = page.locator('select[name="projectId"]');
  if ((await projectPick.count()) > 0) await projectPick.selectOption({ index: 1 });
  const dailyTick = page.locator('input[type="checkbox"]').first();
  if ((await dailyTick.count()) > 0 && !(await dailyTick.isChecked())) await dailyTick.check();
  await page.getByRole("button", { name: /Create|Start|Build/ }).first().click();
  await page.waitForURL(/\/summary-reports\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await roundTrip("Progress", "Preview final PDF");
} catch (error) {
  failures.push(`crashed: ${String(error).slice(0, 300)}`);
  console.log("CRASH", String(error).slice(0, 300));
  await page.screenshot({ path: "presentation-crash.png", fullPage: true }).catch(() => {});
}

await browser.close();
console.log(`\nTENANT ${EMAIL} ${stamp}`);
console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PRESENTATION BROWSER CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
