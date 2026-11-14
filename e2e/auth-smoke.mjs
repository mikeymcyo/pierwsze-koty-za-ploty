/**
 * End-to-end smoke test for the Phase 1 authentication and shell.
 *
 * Drives a real browser at a phone-sized viewport, because that is the device
 * this product is actually used on.
 *
 * Prerequisites — in separate terminals:
 *   npx supabase start
 *   npm run dev
 *
 * Then:
 *   npm run test:e2e
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH if Chromium lives somewhere non-standard.
 */

import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const EMAIL = `siteboss+${stamp}@example.test`;
const PASSWORD = "SiteBoss!2026";
const COMPANY = `Empire Interiors ${stamp}`;
const NAME = "Maciej Korzeniak";

const failures = [];
const consoleErrors = [];

function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}

const launchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

/** The dev overlay injects its own empty [role=alert]; only look inside main. */
const mainAlert = () => page.locator("main [role='alert']").first();

/**
 * Against `next dev`, the first request to a route compiles it on demand, which
 * can take longer than a normal assertion timeout. Warm the public routes up
 * front and give the first authenticated render a generous budget, so a cold
 * dev server is never mistaken for a broken app.
 */
const COLD_COMPILE_TIMEOUT = 60_000;

try {
  console.log("\n0. Warming up routes");
  for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: COLD_COMPILE_TIMEOUT });
  }
  console.log("  done");

  console.log("\n1. Landing page");
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("shows the wordmark", await page.getByText("SiteBoss").first().isVisible());
  check(
    "offers account creation",
    await page.getByRole("link", { name: "Create an account" }).isVisible(),
  );

  console.log("\n2. Sign up creates the account, company and profile");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.waitForURL("**/signup");
  await page.getByLabel("Your name").fill(NAME);
  await page.getByLabel("Company").fill(COMPANY);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/dashboard", { timeout: COLD_COMPILE_TIMEOUT });
  await page
    .getByRole("heading", { name: `Hello, ${NAME}` })
    .waitFor({ timeout: COLD_COMPILE_TIMEOUT });
  check("lands on the dashboard", page.url().endsWith("/dashboard"));
  check("signup trigger created the company", await page.getByText(COMPANY).first().isVisible());
  check("shows the empty projects state", await page.getByText("No active projects yet").isVisible());
  check("shows the empty reports state", await page.getByText("No reports yet").isVisible());

  console.log("\n3. Bottom navigation reaches every destination");
  const nav = page.getByRole("navigation", { name: "Primary" });
  check("bottom nav is visible on mobile", await nav.isVisible());

  for (const [label, path, heading] of [
    ["Projects", "/projects", "Projects"],
    ["Create", "/reports/new", "Create report"],
    ["Reports", "/reports", "Reports"],
    ["Profile", "/profile", "Profile"],
  ]) {
    await nav.getByRole("link", { name: label }).click();
    await page.waitForURL(`**${path}`, { timeout: COLD_COMPILE_TIMEOUT });
    // waitForURL resolves before the new content paints, so wait for the heading.
    await page
      .getByRole("heading", { name: heading, exact: true })
      .waitFor({ timeout: COLD_COMPILE_TIMEOUT });
    check(`${label} opens ${path}`, page.url().endsWith(path));
  }

  console.log("\n4. Profile shows the real session");
  check("shows the email", await page.getByText(EMAIL).isVisible());
  check("shows the company", await page.getByText(COMPANY).first().isVisible());
  check("shows the owner role", await page.getByText("Owner", { exact: true }).isVisible());

  console.log("\n5. Sign out clears the session");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login", { timeout: 20_000 });
  check("returns to login", page.url().includes("/login"));

  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/login**", { timeout: 15_000 });
  check("dashboard is protected once signed out", page.url().includes("/login"));
  check("remembers the intended destination", page.url().includes("next=%2Fdashboard"));

  console.log("\n6. Sign back in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  check("returns to the dashboard", page.url().endsWith("/dashboard"));

  console.log("\n7. A wrong password is reported, not swallowed");
  await page.goto(`${BASE}/profile`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login", { timeout: 20_000 });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await mainAlert().waitFor({ timeout: 20_000 });
  const alertText = (await mainAlert().innerText()).trim();
  check("shows an error message", alertText.length > 0, `alert read "${alertText}"`);
  check("stays on the login page", page.url().includes("/login"));

  console.log("\n8. Server-side validation rejects a short password");
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Your name").fill("Test Person");
  await page.getByLabel("Company").fill("Test Co");
  await page.getByLabel("Email").fill(`short+${stamp}@example.test`);
  await page.getByLabel("Password").evaluate((el, value) => {
    // Drop the browser's own minlength so the server rule is what is tested.
    el.removeAttribute("minlength");
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, "short");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Use at least 8 characters").waitFor({ timeout: 20_000 });
  check("rejects a short password", true);

  console.log("\n9. Password reset does not disclose whether an account exists");
  await page.goto(`${BASE}/forgot-password`);
  await page.getByLabel("Email").fill(`nobody+${stamp}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("a reset link is on its way").waitFor({ timeout: 20_000 });
  check("gives a neutral confirmation", true);
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
}

const realErrors = consoleErrors.filter(
  (message) => !/favicon|React DevTools/i.test(message),
);

console.log("\n=== Console errors ===");
console.log(realErrors.length ? realErrors.map((e) => `  ${e}`).join("\n") : "  none");

console.log("\n=== Result ===");
if (failures.length === 0 && realErrors.length === 0) {
  console.log("ALL END-TO-END CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  for (const error of realErrors) console.log(`CONSOLE ERROR: ${error}`);
  process.exitCode = 1;
}
