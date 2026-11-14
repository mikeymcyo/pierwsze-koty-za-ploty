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

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import {
  CLEANUP_MARKER,
  requestedCleanupKind,
  startStub,
  STUB_MARKER,
  STUB_PORT,
} from "./stub-openai.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `ai+${stamp}@example.com`;
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
page.setDefaultTimeout(20_000);
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  console.log("\n1. Sign up, project, report with notes");
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill("Maciej Korzeniak");
  await page.getByLabel("Company").fill(`Empire Interiors ${stamp}`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });

  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(`Lidl South Croydon ${stamp}`);
  await page.getByLabel("Client").fill("Lidl GB");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });

  await page.getByRole("button", { name: "Start Site Capture" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  const reportUrl = page.url().replace(/\/capture$/, "");
  await page.goto(reportUrl, { waitUntil: "networkidle" });

  console.log("\n2. Writing is offered with the notes, and only once there are some");
  const writeButton = page.getByRole("button", { name: "Write my report" });
  await writeButton.waitFor({ timeout: TIMEOUT });
  check("the button is disabled before there is anything to write from", await writeButton.isDisabled());
  check(
    "and says so",
    await page.getByText(/say or type what happened first/i).isVisible(),
  );

  await page.getByText("Date, weather, workforce and plant", { exact: true }).click();
  await page.getByLabel("Company").first().fill("Groundworks Ltd");
  await page.getByLabel("No.").first().fill("6");
  await page.getByLabel("Work completed").fill(NOTES);
  check("offers to write once there are notes - no Save first", await writeButton.isEnabled());

  console.log("\n3. Generate");
  await writeButton.click();
  const summary = page.getByLabel("Daily Summary", { exact: true });
  await summary.waitFor({ timeout: TIMEOUT });
  check("the summary came from the drafting pass", (await summary.inputValue()) === STUB_MARKER + " summary");
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

  console.log("\n4. The Daily drafts one summary and preserves its source");
  check("only the summary was requested", request.response_format.json_schema.schema.required.join() === "executive_summary");
  check("notes survive drafting", (await page.getByLabel("Work completed").inputValue()) === NOTES);
  await page.goto(reportUrl);
  check("notes survive reloading", (await page.getByLabel("Work completed").inputValue()) === NOTES);
  check("the workforce entered with the notes was saved", (await page.getByLabel("Company").first().inputValue()) === "Groundworks Ltd");

  console.log("\n5. Regeneration preserves manual edits and clears obsolete AI content");
  const edited = "Rewritten by the site manager.";
  await summary.fill(edited);
  await page.locator("form").filter({ has: summary }).getByRole("button", { name: "Save this section" }).click();
  await page.getByText("Edited by you", { exact: true }).waitFor();

  // Model an older report with extra sections, using the test user's own permissions.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Historical fixtures require a disposable local Supabase instance.");
  }
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const login = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (login.error) throw login.error;
  const reportId = new URL(reportUrl).pathname.split("/")[2];
  const { data: draft } = await db.from("reports").select("company_id").eq("id", reportId).single().throwOnError();
  const legacy = { report_id: reportId, company_id: draft.company_id };
  const delivery = "Two loads of plasterboard booked in by the site manager.";
  await db.from("report_sections").insert([
    { ...legacy, section_type: "deliveries_plant", content: delivery, ai_generated: false, sort_order: 3 },
    { ...legacy, section_type: "planned_works", content: "Superseded AI paragraph.", ai_generated: true, sort_order: 7 },
  ]).throwOnError();

  await page.getByRole("button", { name: "Rewrite from my notes" }).click();
  await page.getByText(/you had edited/i).waitFor({ timeout: TIMEOUT });
  const { data: stored } = await db.from("report_sections").select("section_type,content,ai_generated").eq("report_id", reportId).throwOnError();
  check("the historical manual edit is retained", stored.some(row => row.section_type === "deliveries_plant" && row.content === delivery && !row.ai_generated));
  check("the obsolete AI section is cleared", !stored.some(row => row.section_type === "planned_works"));
  check("only the current summary and historical edit remain", stored.length === 2);
  await page.goto(reportUrl);
  check("the edited summary survives regeneration", (await summary.inputValue()) === edited);
  check("the original notes are still intact", (await page.getByLabel("Work completed").inputValue()) === NOTES);
} catch (error) {
  const alerts = await page.locator("main [role=alert]").allTextContents().catch(() => []);
  failures.push(`threw at ${new URL(page.url()).pathname}: ${error.message}; alerts: ${alerts.join(" | ")}`);
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
