/**
 * End-to-end test for Phase 5: AI report drafting.
 *
 * Runs the whole pipeline against a local stub of the OpenAI endpoint, so it
 * needs no API key and costs nothing: prompt construction, the HTTP call,
 * schema-checked parsing, writing report_sections, rendering them, editing one,
 * and the guarantee that the site manager's own words are never overwritten.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start
 *   OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:4010/v1 npm run dev
 *
 * Then:
 *   npm run test:ai
 */

import { chromium } from "playwright";
import {
  CLEANUP_MARKER,
  NARROW_MARKER,
  requestedCleanupKind,
  startStub,
  STUB_MARKER,
  STUB_PORT,
} from "./stub-openai.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const PASSWORD = "SiteBoss!2026";
const NOTES =
  "Continued the drainage run along the eastern boundary. Six groundworkers on site all day. Concrete delivery arrived at half ten, two hours late.";

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

const stub = await startStub({ port: STUB_PORT });
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  console.log("\n1. Sign up, project, report with notes");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(`Empire Interiors ${stamp}`);
  await page.getByLabel("Email").fill(`ai+${stamp}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(`Lidl South Croydon ${stamp}`);
  await page.getByLabel("Client").fill("Lidl GB");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });

  await page.getByRole("button", { name: "New report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const reportUrl = page.url();

  console.log("\n2. Drafting is offered only once there is something to write from");
  await page.getByRole("heading", { name: /the written report/i }).waitFor({ timeout: TIMEOUT });
  check(
    "prompts for notes before offering to write",
    await page.getByText(/turn it into a report/i).isVisible(),
  );

  await page.getByLabel("Company").first().fill("Groundworks Ltd");
  await page.getByLabel("No.").first().fill("6");
  await page.getByLabel("Work completed").fill(NOTES);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.").waitFor({ timeout: TIMEOUT });

  const writeButton = page.getByRole("button", { name: "Write my report" });
  await writeButton.waitFor({ timeout: TIMEOUT });
  check("offers to write once notes are saved", true);

  console.log("\n3. Generate");
  await writeButton.click();
  await page.getByText(`${STUB_MARKER} summary`).waitFor({ timeout: TIMEOUT });
  check("sections are generated and rendered", true);

  const request = stub.received.at(-1);
  check("a request actually reached the model", Boolean(request));
  check(
    "structured output was requested",
    request?.response_format?.type === "json_schema",
    JSON.stringify(request?.response_format ?? null).slice(0, 80),
  );
  const sentPrompt = (request?.messages ?? []).map((m) => m.content).join("\n");
  check("the site manager's own words were sent", sentPrompt.includes(NOTES));
  check("the recorded workforce was sent", sentPrompt.includes("Groundworks Ltd"));
  check(
    "the model was told not to invent",
    /never invent/i.test(sentPrompt),
    "system prompt must forbid invention",
  );

  console.log("\n3a. Two passes ran, in order, and the review had the last word");
  // Cleanup first, review second. The report is written by the review: if that
  // order ever inverts, or the cleanup call stops happening, the layer is not
  // doing anything and this is where it shows.
  const passes = stub.received.map((sent) => requestedCleanupKind(sent));
  check("the cleanup pass ran", passes.includes("daily"), JSON.stringify(passes));
  check("it ran first", passes[0] === "daily", JSON.stringify(passes));
  check("and the review ran after it", passes.at(-1) === null, JSON.stringify(passes));
  check(
    "the review was handed the cleaned draft",
    sentPrompt.includes(CLEANUP_MARKER),
    "the cleaned sections must reach the drafting prompt",
  );
  check(
    "and was told the draft is not evidence",
    /not evidence, and not a source of fact/i.test(sentPrompt),
  );
  check(
    "the cleanup pass was given the notes verbatim",
    (stub.received[0]?.messages ?? []).map((m) => m.content).join("\n").includes(NOTES),
  );

  console.log("\n4. Empty sections are dropped, not padded");
  // The headings are CSS-uppercased, and innerText reports the transformed
  // text - so compare case-insensitively or both checks pass for the wrong
  // reason.
  const bodyText = (await page.locator("main").innerText()).toLowerCase();
  check("a supported section is present", bodyText.includes("works completed"));
  check(
    "an unsupported section is omitted",
    !bodyText.includes("works in progress"),
    "the stub returned '' for it, so it must not be rendered",
  );

  console.log("\n5. The raw notes survive generation, verbatim");
  await page.getByText("What you actually said").click();
  const notesPanel = page.locator("details", { hasText: "What you actually said" });
  check(
    "raw notes are shown next to the draft",
    (await notesPanel.innerText()).includes(NOTES),
  );
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check(
    "and are still in the notes field, unchanged",
    (await page.getByLabel("Work completed").inputValue()) === NOTES,
  );

  console.log("\n6. A section can be edited, and stops claiming to be AI-written");
  const edited = "Rewritten by the site manager.";
  // Wait for hydration before typing: a real user reads before editing, and
  // typing into a not-yet-interactive page is not what this check is about.
  await page.getByRole("button", { name: "Rewrite from my notes" }).waitFor({ timeout: TIMEOUT });
  const summaryBox = page.getByLabel("Summary");
  await summaryBox.fill(edited);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Summary") })
    .getByRole("button", { name: "Save" })
    .click();
  await page.getByText("Edited by you").first().waitFor({ timeout: TIMEOUT });
  check("the edit is marked as the user's own", true);

  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check("the edit persisted", (await page.getByLabel("Summary").inputValue()) === edited);

  console.log("\n7. Regenerating does not overwrite what the user wrote");
  await page.getByRole("button", { name: "Rewrite from my notes" }).click();
  // The outcome alert is what settles the action - the summary deliberately
  // does not change, so waiting on its text would wait for something that must
  // never arrive.
  await page.getByText(/you had edited/i).waitFor({ timeout: TIMEOUT });
  check("the screen says a section was kept", true);

  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  check(
    "the edited summary is untouched",
    (await page.getByLabel("Summary").inputValue()) === edited,
    await page.getByLabel("Summary").inputValue(),
  );
  check("and is still marked as the user's", (await page.getByText("Edited by you").count()) === 1);
  check(
    "the sections the AI owns were rewritten",
    (await page.locator("main").innerText()).includes(`${STUB_MARKER} works completed`),
  );
  const summaryCount = await page.getByLabel("Summary").count();
  check("still exactly one summary section", summaryCount === 1, `saw ${summaryCount}`);

  console.log("\n8. A narrower draft clears what it no longer supports");

  // A second edited section, this time one the narrower draft will leave
  // empty - so it is exposed to the clear-out as well as to the overwrite.
  const keptByHand = "Two loads of plasterboard, booked in by me.";
  await page.getByLabel("Deliveries and plant").fill(keptByHand);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Deliveries and plant") })
    .getByRole("button", { name: "Save" })
    .click();
  await page.getByText("Edited by you").nth(1).waitFor({ timeout: TIMEOUT });

  // Now regenerate against notes the stub answers with a narrower draft:
  // deliveries and planned works both come back empty.
  await page.getByLabel("Work completed").fill(`${NOTES} ${NARROW_MARKER}`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.").waitFor({ timeout: TIMEOUT });
  await page.getByRole("button", { name: "Rewrite from my notes" }).click();
  await page.getByText(/you had edited/i).waitFor({ timeout: TIMEOUT });

  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  const afterNarrow = await page.locator("main").innerText();

  // The paragraph the new draft no longer supports must go. Leaving it would
  // put the previous draft's claim under a heading today's notes do not carry.
  check(
    "a stale AI section is cleared",
    !afterNarrow.includes(`${STUB_MARKER} planned works`),
    "the previous draft's planned works survived a narrower regeneration",
  );
  check(
    "the section the new draft did support was rewritten",
    afterNarrow.includes(`${STUB_MARKER} works completed`),
  );

  // Both sections a person wrote must survive: one the draft covered and would
  // have overwritten, one it left empty and would have deleted.
  check(
    "the edited section the draft covered is not overwritten",
    afterNarrow.includes(edited),
    "the user's summary was replaced by a regeneration",
  );
  check(
    "the edited section the draft dropped is not cleared",
    afterNarrow.includes(keptByHand),
    "the user's own deliveries text was deleted by the clear-out",
  );
  check(
    "both are still marked as theirs",
    (await page.getByText("Edited by you").count()) === 2,
    `saw ${await page.getByText("Edited by you").count()}`,
  );
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
  await stub.close();
}

const realErrors = consoleErrors.filter((m) => !/favicon|React DevTools/i.test(m));
console.log("\n=== Console errors ===");
console.log(realErrors.length ? realErrors.map((e) => `  ${e}`).join("\n") : "  none");
console.log("\n=== Result ===");
if (failures.length === 0 && realErrors.length === 0) {
  console.log("ALL AI CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  for (const e of realErrors) console.log(`CONSOLE ERROR: ${e}`);
  process.exitCode = 1;
}
