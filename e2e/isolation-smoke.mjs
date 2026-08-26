/**
 * Proves the core security promise through the running application: a user can
 * never see another company's project data.
 *
 * The database tests in supabase/tests cover this at the SQL layer. This one
 * goes through the real browser, the real session cookies and PostgREST, which
 * is the path an attacker would actually take.
 *
 * Prerequisites — in separate terminals:
 *   npx supabase start
 *   npm run dev
 *
 * Then, with the service role key from `npx supabase status`:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npm run test:isolation
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is required. Get it from `npx supabase status`.",
  );
  process.exit(1);
}

const stamp = Date.now();
const PASSWORD = "SiteBoss!2026";
const SECRET_PROJECT = `Lidl South Croydon ${stamp}`;

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

/** Admin query that bypasses RLS, used only to plant the fixture data. */
async function admin(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} on ${path}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

const launchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);

async function signUp(page, { name, company, email }) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Company").fill(company);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

try {
  const alice = { name: "Alice Fenton", company: `Empire Interiors ${stamp}`, email: `alice+${stamp}@example.test` };
  const bob = { name: "Bob Grant", company: `Rival Groundworks ${stamp}`, email: `bob+${stamp}@example.test` };

  console.log("\n1. Two companies sign up");
  const aliceContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alicePage = await aliceContext.newPage();
  await signUp(alicePage, alice);
  check("Alice reaches her dashboard", alicePage.url().endsWith("/dashboard"));

  const bobContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bobPage = await bobContext.newPage();
  await signUp(bobPage, bob);
  check("Bob reaches his dashboard", bobPage.url().endsWith("/dashboard"));

  console.log("\n2. Alice's company gets a project");
  const companies = await admin(
    `companies?name=eq.${encodeURIComponent(alice.company)}&select=id`,
  );
  check("Alice's company exists", companies.length === 1);
  const aliceCompanyId = companies[0].id;

  await admin("projects", {
    method: "POST",
    body: JSON.stringify({
      company_id: aliceCompanyId,
      name: SECRET_PROJECT,
      client: "Lidl GB",
      site_address: "South Croydon",
      project_reference: "1470",
      site_manager: "Maciej",
      status: "active",
    }),
  });

  console.log("\n3. Alice sees her own project");
  await alicePage.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  check(
    "project is listed for Alice",
    await alicePage.getByText(SECRET_PROJECT).isVisible(),
  );
  await alicePage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  check(
    "project appears on Alice's dashboard",
    await alicePage.getByText(SECRET_PROJECT).isVisible(),
  );

  console.log("\n4. Bob sees nothing of Alice's");
  await bobPage.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  const bobSeesProject = await bobPage
    .getByText(SECRET_PROJECT)
    .isVisible()
    .catch(() => false);
  check("project is hidden from Bob", !bobSeesProject);
  check(
    "Bob still gets his own empty state",
    await bobPage.getByText("No projects yet").isVisible(),
  );

  await bobPage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const bobDashboardLeak = await bobPage
    .getByText(SECRET_PROJECT)
    .isVisible()
    .catch(() => false);
  check("Bob's dashboard is clean", !bobDashboardLeak);

  console.log("\n5. Bob's own session token cannot fetch it either");
  // Read Bob's access token from the cookie the app set, then query PostgREST
  // directly as Bob — bypassing the UI entirely.
  // The session cookie is "sb-<ref>-auth-token", optionally split into
  // ".0", ".1" chunks. The "-code-verifier" cookies are a different thing.
  const sessionCookiePattern = /^sb-.+-auth-token(\.(\d+))?$/;
  const cookies = (await bobContext.cookies())
    .filter((cookie) => sessionCookiePattern.test(cookie.name))
    .sort((a, b) => {
      const index = (name) => Number(sessionCookiePattern.exec(name)?.[2] ?? 0);
      return index(a.name) - index(b.name);
    });
  const authCookie = cookies.map((cookie) => cookie.value).join("");

  let bobToken = null;
  try {
    const raw = authCookie.startsWith("base64-")
      ? Buffer.from(authCookie.slice("base64-".length), "base64").toString("utf8")
      : decodeURIComponent(authCookie);
    bobToken = JSON.parse(raw).access_token;
  } catch {
    bobToken = null;
  }

  if (!bobToken) {
    check("could read Bob's access token", false, "cookie format not recognised");
  } else {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=name`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${bobToken}`,
      },
    });
    const rows = await response.json();
    check("direct API call succeeds for Bob", response.ok, JSON.stringify(rows));
    check(
      "direct API call returns none of Alice's projects",
      Array.isArray(rows) && rows.every((row) => row.name !== SECRET_PROJECT),
      JSON.stringify(rows),
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
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
