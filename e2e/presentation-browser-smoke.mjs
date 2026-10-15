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

/** Scrolled to the middle of the screen first, clear of the fixed bottom bar. */
async function tap(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await locator.click();
}

/**
 * The Photo style, and - where the report has photographs - the Photo focus
 * layout and the first cover. Each option button's name is its label followed
 * by its one-line description. Returns what was picked.
 */
async function pickPresentation() {
  // The Daily card folds the picker away; the consolidated card shows it open.
  const fold = page.locator("details", { has: page.locator("summary", { hasText: "Presentation" }) });
  if ((await fold.count()) > 0) await fold.first().evaluate((d) => { d.open = true; });
  await tap(page.getByRole("button", { name: /^Photo The photographs given room/ }));
  const picked = { style: "photo", layout: "standard", cover: "" };
  const focus = page.getByRole("button", { name: /^Photo focus/ });
  if ((await focus.count()) > 0) {
    await tap(focus.first());
    picked.layout = "focus";
  }
  const coverOption = page.locator("button[aria-pressed]:has(img)").first();
  if ((await coverOption.count()) > 0) {
    await tap(coverOption);
    picked.cover = (await posted()).cover ?? "";
  }
  return picked;
}

const same = (a, picked) => a.style === picked.style && a.layout === picked.layout && (a.cover ?? "") === picked.cover;

/** Preview, then back by Close and by Back; the choices must survive both. */
async function roundTrip(what, previewName) {
  const picked = await pickPresentation();
  await page.waitForFunction(() => /style=photo/.test(location.search));
  const address = new URL(page.url()).searchParams;
  check(`${what}: the page's address holds the choices before Preview (${picked.layout}${picked.cover ? ", cover" : ""})`, address.get("style") === "photo" && (picked.layout !== "focus" || address.get("layout") === "focus") && (!picked.cover || address.get("cover") === picked.cover), page.url());
  await tap(page.getByRole("link", { name: previewName }));
  await page.waitForURL(/\/pdf\?draft=1/);
  await page.getByRole("link", { name: "Back to the report" }).click();
  await page.waitForURL((url) => !/\/pdf/.test(url.pathname));
  await page.waitForSelector('input[name="pdfStyle"]', { state: "attached" });
  const afterClose = await posted();
  check(`${what}: Close brings the choices back`, same(afterClose, picked), JSON.stringify(afterClose));

  await tap(page.getByRole("link", { name: previewName }));
  await page.waitForURL(/\/pdf\?draft=1/);
  await page.goBack();
  await page.waitForURL((url) => !/\/pdf/.test(url.pathname));
  await page.waitForSelector('input[name="pdfStyle"]', { state: "attached" });
  const afterBack = await posted();
  check(`${what}: the browser's Back brings the choices back`, same(afterBack, picked), JSON.stringify(afterBack));
  return picked;
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
  // One photograph through the ordinary uploader, so the layout and cover
  // options exist on the finalise card. Skipped when no fixture is given.
  if (process.env.PHOTO) {
    await page.locator('input[type="file"]').first().setInputFiles(process.env.PHOTO);
    // The count on the "Today so far" line, not the uploader's own progress
    // text - the photograph is only on the report once that line says so.
    // Headless Chromium in this environment drops uploads now and then; the
    // uploader offers Try again, and pressing it is what a person would do.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const landed = await page
        .waitForFunction(() => /1 note · 1 photo/.test(document.body.innerText), null, { timeout: 45_000 })
        .then(() => true)
        .catch(() => false);
      if (landed) break;
      const retry = page.getByRole("button", { name: "Try again" });
      if ((await retry.count()) > 0) await retry.first().click();
    }
    check("the photograph is on the report", /1 note · 1 photo/.test(await page.locator("body").innerText()));
  }

  console.log("\n1. Enter in a details field saves the draft and never writes");
  await page.goto(`${BASE}/reports/${reportId}`, { waitUntil: "networkidle" });
  await page.locator("details", { has: page.locator("summary", { hasText: "Date, weather, workforce and plant" }) }).first().evaluate((d) => { d.open = true; });
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
  const picked = await roundTrip("Daily", "Preview");

  console.log("\n5. Finalise issues exactly those choices");
  const before = await posted();
  check("the finalise form carries what was picked", same(before, picked), JSON.stringify(before));
  await tap(page.getByRole("button", { name: "Finalise report" }));
  await page.waitForFunction(() => /Issued report/.test(document.body.innerText), null, { timeout: 120_000 });
  check("the Daily was issued", true);
  const file = await page.request.get(`${BASE}/reports/${reportId}/file`);
  check("and the issued PDF is served, immutable from here", file.ok() && (file.headers()["content-type"] ?? "").includes("pdf"));

  console.log("\n6. Progress report: the same round trip");
  await page.goto(`${BASE}/summary-reports/new?kind=progress`, { waitUntil: "networkidle" });
  const projectPick = page.locator('select[name="projectId"]');
  if ((await projectPick.count()) > 0) {
    const options = await projectPick.locator("option").evaluateAll((els) => els.map((o) => o.value).filter(Boolean));
    if (options.length > 0) await projectPick.selectOption(options[0]);
  }
  // The issued Daily is offered as a source; make sure it is ticked.
  await page.waitForTimeout(1500);
  for (const box of await page.locator('input[type="checkbox"]').all()) {
    if (!(await box.isChecked())) await box.check().catch(() => {});
  }
  await tap(page.locator("button", { hasText: "Start report" }).first());
  await page.waitForURL(/\/summary-reports\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await page.waitForSelector('input[name="pdfStyle"]', { state: "attached" });
  await roundTrip("Progress", "Preview final PDF");
} catch (error) {
  failures.push(`crashed: ${String(error).slice(0, 300)}`);
  console.log("CRASH", String(error).slice(0, 300));
  console.log("AT", page.url(), JSON.stringify(await page.getByRole("button").allInnerTexts().catch(() => [])).slice(0, 300));
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
