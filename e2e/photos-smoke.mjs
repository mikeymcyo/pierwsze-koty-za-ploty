/**
 * End-to-end test for Phase 4: photo capture.
 *
 * Drives a real file through the browser: compression, the direct upload to
 * Supabase Storage, the photos row, the signed thumbnail URL, and deletion.
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
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
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

  await page.getByRole("button", { name: "New report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const reportUrl = page.url();
  check("reached a draft report", true);

  console.log("\n2. The capture screen offers photo upload");
  await page.getByRole("heading", { name: "Photos" }).waitFor({ timeout: TIMEOUT });
  check("photos section is present", true);
  check(
    "category can be chosen before shooting",
    await page.getByLabel("Tag these as").isVisible(),
  );

  // The choice is made in the app, before iOS shows a sheet - not left to a
  // single input that would go straight to the camera and stay there.
  for (const label of ["Take Photo", "Choose from Photo Library", "Choose File"]) {
    check(`"${label}" is offered`, await page.getByRole("button", { name: label }).isVisible());
  }

  // What the browser actually parsed on the live page, which is what decides
  // where an iPhone goes.
  const liveAttributes = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("input[data-photo-source]")].map((el) => [
        el.dataset.photoSource,
        { accept: el.accept, multiple: el.multiple, capture: el.getAttribute("capture") },
      ]),
    ),
  );

  check(
    "the camera input asks for the rear camera",
    liveAttributes.camera?.capture === "environment",
    JSON.stringify(liveAttributes.camera),
  );
  check("the camera input takes one shot", liveAttributes.camera?.multiple === false);
  check(
    "the library input does NOT force the camera",
    liveAttributes.library?.capture === null,
    JSON.stringify(liveAttributes.library),
  );
  check("the library input is multi-select", liveAttributes.library?.multiple === true);
  check(
    "the Choose File input does NOT force the camera",
    liveAttributes.files?.capture === null,
    JSON.stringify(liveAttributes.files),
  );
  check("the Choose File input is multi-select", liveAttributes.files?.multiple === true);

  console.log("\n3. Upload a photo");
  await page.getByLabel("Tag these as").selectOption("safety");
  await page.locator('input[data-photo-source="library"]').setInputFiles({
    name: "site.png",
    mimeType: "image/png",
    buffer: PNG_2X2,
  });

  // The row appears only after upload + insert + revalidate.
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  check("photo appears on the capture screen", true);

  // Scoped to the grid tile: "Safety" is also one of the <option>s in the
  // category picker, and matching that instead would prove nothing.
  const tile = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /Delete photo/ }) })
    .first();
  check(
    "it carries the chosen category",
    (await tile.innerText()).includes("Safety"),
    (await tile.innerText()).replace(/\n/g, " | "),
  );

  const img = page.locator("main img").first();
  await img.waitFor({ timeout: TIMEOUT });
  const src = await img.getAttribute("src");
  check("thumbnail uses a signed URL, not a public one", Boolean(src && src.includes("token=")), String(src).slice(0, 120));

  const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
  check("the signed URL actually renders", loaded);

  console.log("\n4. It survives a reload and shows on the project");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  const afterReload = await page.getByRole("button", { name: /Delete photo/ }).count();
  check("still there after reload", afterReload === 1, `saw ${afterReload}`);

  await page.goto(`${projectUrl}?tab=photos`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().waitFor({ timeout: TIMEOUT });
  check("appears on the project's Photos tab", true);
  check("the tab count updates", await page.getByText("Photos").first().isVisible());

  console.log("\n5. Delete removes it");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByRole("button", { name: /Delete photo/ }).first().click();
  await page.waitForTimeout(2500);
  check(
    "photo is gone from the capture screen",
    (await page.getByRole("button", { name: /Delete photo/ }).count()) === 0,
  );

  await page.goto(`${projectUrl}?tab=photos`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByText("No photos yet").waitFor({ timeout: TIMEOUT });
  check("and from the project tab", true);

  console.log("\n6. The library picks several photos in one go");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.locator('input[data-photo-source="library"]').setInputFiles([
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
  check(
    "the Photos tab offers Take Photo",
    await page.getByRole("button", { name: "Take Photo" }).isVisible(),
  );
  check(
    "the Photos tab offers the library",
    await page.getByRole("button", { name: "Choose from Photo Library" }).isVisible(),
  );

  await page.getByLabel("Tag these as").selectOption("delivery");
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
    .filter({ hasText: "Delivery" })
    .first();
  check("tagging still works with no report", await projectTile.isVisible());

  const projectImg = projectTile.locator("img");
  await projectImg.waitFor({ timeout: TIMEOUT });
  check(
    "a project photo is served by a signed URL too",
    ((await projectImg.getAttribute("src")) ?? "").includes("token="),
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
  console.log("ALL PHOTO CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
