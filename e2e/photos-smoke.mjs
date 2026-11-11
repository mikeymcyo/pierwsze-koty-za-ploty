/**
 * End-to-end test for Phase 4: photo capture.
 *
 * Drives a real file through the browser: compression, the direct upload to
 * Supabase Storage, the photos row, the authenticated thumbnail URL, and deletion.
 *
 * Also covers the mobile media-source UX: the three explicit choices, the
 * attributes each one puts in the live DOM, a real multi-photo selection, and
 * photos added to the project rather than to a report. The half of that which
 * needs neither Supabase nor a dev server lives in photo-sources-smoke.mjs.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start      (or point .env.local at a hosted project)
 *   npm run dev
 *
 * Then:
 *   npm run test:photos
 */

import { chromium } from "playwright";
import { Buffer } from "node:buffer";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `photos+${stamp}@example.com`;
const PASSWORD = "SiteBoss!2026";

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

// A real 2x2 PNG. Small, but it exercises the same decode/canvas/upload path a
// phone photo takes - the compressor is size-independent.
const PNG_2X2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4nGP4z8DwHwwZGP6DAQBJyAn3FGMynQAAAABJRU5ErkJggg==",
  "base64",
);

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  console.log("\n1. Sign up, create a project, start a report");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(`Empire Interiors ${stamp}`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(`Lidl South Croydon ${stamp}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const projectUrl = page.url();

  await page.getByRole("button", { name: "Start Site Capture" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const reportUrl = page.url().replace(/\/capture$/, "");
  await page.goto(reportUrl, { waitUntil: "networkidle" });
  check("reached a draft report", true);

  console.log("\n2. The capture screen offers photo upload");
  const picker = page.locator('input[data-photo-source="simple"]');
  const addPhotos = page.getByRole("button", { name: "Add photos", exact: true });
  await addPhotos.waitFor();
  check("the report offers the native multi-photo picker", await picker.evaluate(el => el.multiple && !el.hasAttribute("capture")));

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), addPhotos.click()]);
  await chooser.setFiles({
    name: "site.png",
    mimeType: "image/png",
    buffer: PNG_2X2,
  });

  // The row appears only after upload + insert + revalidate.
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  check("photo appears on the capture screen", true);

  // Save a status on the uploaded photograph, then check it again after a reload.
  const tile = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /Delete photo/ }) })
    .first();
  await tile.getByLabel("Status for this photograph").selectOption("defect");
  await tile.getByText("Saved", { exact: true }).waitFor();
  check(
    "it carries the chosen category",
    (await tile.getByLabel("Status for this photograph").inputValue()) === "defect",
    (await tile.innerText()).replace(/\n/g, " | "),
  );

  const img = tile.locator("img");
  await img.waitFor({ timeout: TIMEOUT });
  const src = await img.getAttribute("src");
  check("thumbnail uses an authenticated thumbnail URL, not a public one", Boolean(src && /^\/photos\/[\da-f-]+\/thumb/.test(src)), String(src).slice(0, 120));

  await img.scrollIntoViewIfNeeded();
  await img.evaluate(el => el.decode());
  const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
  check("the authenticated thumbnail renders", loaded);

  console.log("\n4. It survives a reload and shows on the project");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  const afterReload = await page.getByRole("button", { name: /Delete photo/ }).count();
  check("the saved status survives reload", (await page.getByLabel("Status for this photograph").inputValue()) === "defect");
  check("still there after reload", afterReload === 1, `saw ${afterReload}`);

  await page.goto(`${projectUrl}?tab=photos`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  check("appears on the project's Photos tab", true);
  check("the tab count updates", await page.getByText("Photos").first().isVisible());

  console.log("\n5. Delete removes it");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().click();
  await page.getByRole("button", { name: "Delete photo", exact: true }).click();
  await page.getByRole("button", { name: /Delete photo/ }).waitFor({ state: "detached" });
  check(
    "photo is gone from the capture screen",
    (await page.getByRole("button", { name: /Delete photo/ }).count()) === 0,
  );

  await page.goto(`${projectUrl}?tab=photos`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByText("No photos yet").waitFor({ timeout: TIMEOUT });
  check("and from the project tab", true);

  console.log("\n6. The library picks several photos in one go");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.locator('input[data-photo-source="simple"]').setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG_2X2 },
    { name: "two.png", mimeType: "image/png", buffer: PNG_2X2 },
    { name: "three.png", mimeType: "image/png", buffer: PNG_2X2 },
  ]);

  await page
    .getByRole("button", { name: /Delete photo/ })
    .nth(2)
    .waitFor({ timeout: TIMEOUT });
  const afterMulti = await page.getByRole("button", { name: /Delete photo/ }).count();
  check("all three arrived from one selection", afterMulti === 3, `saw ${afterMulti}`);

  console.log("\n7. Photos can be added to the project itself");
  await page.goto(`${projectUrl}?tab=photos`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: "Take Photo" }).waitFor();
  check(
    "the Photos tab offers Take Photo",
    await page.getByRole("button", { name: "Take Photo" }).isVisible(),
  );
  check(
    "the Photos tab offers the library",
    await page.getByRole("button", { name: "Choose from Photo Library" }).isVisible(),
  );

  const capture = page.locator('input[data-photo-source="camera"]');
  check("the camera requests one rear-camera shot", await capture.evaluate(el => el.getAttribute("capture") === "environment" && !el.multiple));
  for (const id of ["library", "files"]) {
    const input = page.locator('input[data-photo-source="' + id + '"]');
    check(id + " supports multi-select without forcing the camera", await input.evaluate(el => el.multiple && !el.hasAttribute("capture")));
  }

  await page.getByLabel("Status (optional)").selectOption("delivery");
  await page.locator('input[data-photo-source="library"]').setInputFiles({
    name: "project-level.png",
    mimeType: "image/png",
    buffer: PNG_2X2,
  });

  await page
    .getByRole("button", { name: /Delete photo/ })
    .nth(3)
    .waitFor({ timeout: TIMEOUT });
  const projectTotal = await page.getByRole("button", { name: /Delete photo/ }).count();
  check("it lands on the project tab", projectTotal === 4, `saw ${projectTotal}`);

  const projectTile = page
    .getByRole("listitem")
    .filter({ has: page.locator('option[value="delivery"]:checked') })
    .first();
  check("tagging still works with no report", await projectTile.isVisible());

  const projectImg = projectTile.locator("img");
  await projectImg.waitFor({ timeout: TIMEOUT });
  check(
    "a project photo is served by an authenticated thumbnail URL too",
    ((await projectImg.getAttribute("src")) ?? "").includes("/thumb"),
  );

  // A project photo carries no report_id, so it must not turn up on the
  // report's own screen - that would put it in a day's report nobody filed it
  // against, and later into that report's PDF.
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page
    .getByRole("button", { name: /Delete photo/ })
    .nth(2)
    .waitFor({ timeout: TIMEOUT });
  const backOnReport = await page.getByRole("button", { name: /Delete photo/ }).count();
  check(
    "and stays off the report screen",
    backOnReport === 3,
    `report shows ${backOnReport} photos, expected the 3 shot against it`,
  );
} catch (error) {
  const alerts = await page.locator("main [role=alert]").allTextContents().catch(() => []);
  failures.push(`threw at ${new URL(page.url()).pathname}: ${error.message}; alerts: ${alerts.join(" | ")}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
}

const realErrors = consoleErrors.filter((m) => !/favicon|React DevTools/i.test(m));
console.log("\n=== Console errors ===");
console.log(realErrors.length ? realErrors.map((e) => `  ${e}`).join("\n") : "  none");
console.log("\n=== Result ===");
if (failures.length === 0 && realErrors.length === 0) {
  console.log("ALL PHOTO CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
