/**
 * Proves the core security promise through the running application: a user can
 * never see another company's project data.
 *
 * The database tests in supabase/tests cover this at the SQL layer. This one
 * goes through the real browser, real session cookies and PostgREST, which is
 * the path an attacker would actually take.
 *
 * Both companies are created through the UI and their projects are created
 * through the UI too, so this needs no privileged key - it runs against a local
 * or a hosted Supabase project identically.
 *
 * Prerequisites - in separate terminals:
 *   npx supabase start      (or point .env.local at a hosted project)
 *   npm run dev
 *
 * Then:
 *   npm run test:isolation
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const PASSWORD = "SiteBoss!2026";
const TIMEOUT = 60_000;

const ALICE = {
  name: "Alice Fenton",
  company: `Empire Interiors ${stamp}`,
  email: `alice+${stamp}@example.com`,
  project: `Lidl South Croydon ${stamp}`,
};
const BOB = {
  name: "Bob Grant",
  company: `Rival Groundworks ${stamp}`,
  email: `bob+${stamp}@example.com`,
  project: `Aldi Purley ${stamp}`,
};

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const launchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}
const browser = await chromium.launch(launchOptions);

async function signUp(page, person) {
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Your name").fill(person.name);
  await page.getByLabel("Company").fill(person.company);
  await page.getByLabel("Email").fill(person.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: TIMEOUT });
  await page.getByRole("heading", { name: /Hello,/ }).waitFor({ timeout: TIMEOUT });
}

/** Creates a project through the UI and returns its id. */
async function createProject(page, name) {
  await page.goto(`${BASE}/projects/new`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  return page.url().split("/projects/")[1].split("?")[0];
}

/** Starts a report on a project through the UI and returns its id. */
async function startReport(page, projectId) {
  await page.goto(`${BASE}/projects/${projectId}`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.getByRole("button", { name: "New report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: TIMEOUT });
  return page.url().split("/reports/")[1].split("?")[0];
}

/** Reads the Supabase access token out of the browser's session cookie. */
async function accessToken(context) {
  const pattern = /^sb-.+-auth-token(\.(\d+))?$/;
  const chunks = (await context.cookies())
    .filter((c) => pattern.test(c.name))
    .sort((a, b) => Number(pattern.exec(a.name)?.[2] ?? 0) - Number(pattern.exec(b.name)?.[2] ?? 0));
  if (chunks.length === 0) return null;
  const raw = chunks.map((c) => c.value).join("");
  try {
    const json = raw.startsWith("base64-")
      ? Buffer.from(raw.slice("base64-".length), "base64").toString("utf8")
      : decodeURIComponent(raw);
    return JSON.parse(json).access_token ?? null;
  } catch {
    return null;
  }
}

try {
  console.log("\n1. Two companies sign up and each creates a project");
  const aliceCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alicePage = await aliceCtx.newPage();
  await signUp(alicePage, ALICE);
  const aliceProjectId = await createProject(alicePage, ALICE.project);
  check("Alice created her project", Boolean(aliceProjectId));

  const bobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bobPage = await bobCtx.newPage();
  await signUp(bobPage, BOB);
  const bobProjectId = await createProject(bobPage, BOB.project);
  check("Bob created his project", Boolean(bobProjectId));
  check("the two projects are distinct", aliceProjectId !== bobProjectId);

  console.log("\n2. Each sees only their own");
  await alicePage.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await alicePage.getByRole("heading", { name: "Projects", exact: true }).waitFor({ timeout: TIMEOUT });
  check("Alice sees her project", await alicePage.getByText(ALICE.project).isVisible());
  check(
    "Alice cannot see Bob's",
    !(await alicePage.getByText(BOB.project).isVisible().catch(() => false)),
  );

  await bobPage.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await bobPage.getByRole("heading", { name: "Projects", exact: true }).waitFor({ timeout: TIMEOUT });
  check("Bob sees his project", await bobPage.getByText(BOB.project).isVisible());
  check(
    "Bob cannot see Alice's",
    !(await bobPage.getByText(ALICE.project).isVisible().catch(() => false)),
  );

  console.log("\n3. Guessing the URL of another company's project gets nothing");
  await bobPage.goto(`${BASE}/projects/${aliceProjectId}`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await bobPage.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("Bob gets not-found for Alice's project id", true);
  check(
    "and none of its content leaks",
    !(await bobPage.getByText(ALICE.project).isVisible().catch(() => false)),
  );

  console.log("\n4. Editing another company's project is refused");
  await bobPage.goto(`${BASE}/projects/${aliceProjectId}/edit`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await bobPage.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("Bob cannot open the edit form for Alice's project", true);

  console.log("\n5. Reports are isolated too");
  const aliceReportId = await startReport(alicePage, aliceProjectId);
  check("Alice started a report on her project", Boolean(aliceReportId));

  await bobPage.goto(`${BASE}/reports/${aliceReportId}`, {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await bobPage.getByText("Page not found").waitFor({ timeout: TIMEOUT });
  check("Bob gets not-found for Alice's report id", true);
  check(
    "and none of Alice's project name leaks through it",
    !(await bobPage.getByText(ALICE.project).isVisible().catch(() => false)),
  );

  await bobPage.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await bobPage.getByRole("heading", { name: "Reports", exact: true }).waitFor({ timeout: TIMEOUT });
  check(
    "Alice's report is absent from Bob's reports list",
    (await bobPage.getByText("Report 001").count()) === 0,
  );

  console.log("\n6. Bob's own session token cannot fetch it from the API either");
  const token = await accessToken(bobCtx);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token) {
    check("could read Bob's access token", false, "cookie format not recognised");
  } else if (!supabaseUrl || !supabaseKey) {
    console.log(
      "  [SKIP] direct API check - set NEXT_PUBLIC_SUPABASE_URL and the key to enable it",
    );
  } else {
    const res = await fetch(`${supabaseUrl}/rest/v1/projects?select=id,name`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    });
    const rows = await res.json();
    check("direct API call succeeds for Bob", res.ok, JSON.stringify(rows).slice(0, 160));
    check(
      "it returns exactly one project - his own",
      Array.isArray(rows) && rows.length === 1 && rows[0].name === BOB.project,
      JSON.stringify(rows).slice(0, 160),
    );

    const targeted = await fetch(
      `${supabaseUrl}/rest/v1/projects?select=id,name&id=eq.${aliceProjectId}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } },
    );
    const targetedRows = await targeted.json();
    check(
      "asking for Alice's project by id returns nothing",
      Array.isArray(targetedRows) && targetedRows.length === 0,
      JSON.stringify(targetedRows).slice(0, 160),
    );

    const reportRes = await fetch(
      `${supabaseUrl}/rest/v1/reports?select=id,report_number&id=eq.${aliceReportId}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } },
    );
    const reportRows = await reportRes.json();
    check(
      "asking for Alice's report by id returns nothing",
      Array.isArray(reportRows) && reportRows.length === 0,
      JSON.stringify(reportRows).slice(0, 160),
    );
  }
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
}

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("COMPANY ISOLATION VERIFIED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
