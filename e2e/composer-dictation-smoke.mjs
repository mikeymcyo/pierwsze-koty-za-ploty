/**
 * Dictation into the Site Capture composer, the way an iPhone delivers it.
 *
 * Headless Chromium has no microphone, so the recogniser is replaced before
 * the page loads with one that behaves like WebKit on iOS:
 *
 *   - while somebody speaks, every result is interim - nothing is final;
 *   - the final phrase arrives only after stop(), followed by onend;
 *   - a session can end by itself after a pause, and the hook starts another.
 *
 * That is the lifecycle that made a whole sentence look lost on a real phone:
 * the box showed only final text, and on iOS there was none until the end.
 * This drives the real screen against that lifecycle. It is not a substitute
 * for speaking into a real iPhone - it is the regression net under it.
 *
 * Needs a running deployment (it signs up a throwaway company):
 *
 *   E2E_BASE_URL=https://… npm run test:composer-dictation
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

/**
 * Installed before any page script. `window.__speech` is the test's hand on
 * the microphone: say() delivers interim words, end() closes a session the
 * way iOS does after a pause, and `stopMode` picks what stop() does.
 */
function fakeIosRecognition() {
  const control = {
    current: null,
    sessions: 0,
    // "final": stop() delivers the phrase as final, then onend (normal iOS).
    // "silent": stop() does nothing at all (the session had already ended).
    // "empty": stop() ends with nothing heard.
    stopMode: "final",
    say(words) {
      const r = control.current;
      if (!r) return false;
      r._phrase = r._phrase ? `${r._phrase} ${words}` : words;
      r.onresult?.({ results: { length: 1, 0: { isFinal: false, 0: { transcript: r._phrase } } } });
      return true;
    },
    // A pause long enough for iOS to close the session by itself, with the
    // phrase in flight never marked final.
    end() {
      const r = control.current;
      if (!r) return;
      control.current = null;
      r._ended = true;
      r.onend?.();
    },
  };
  class FakeRecognition {
    constructor() {
      this.lang = "";
      this.continuous = false;
      this.interimResults = false;
      this._phrase = "";
      this._ended = false;
    }
    start() {
      control.sessions += 1;
      control.current = this;
    }
    stop() {
      if (this._ended || control.stopMode === "silent") return;
      const phrase = this._phrase;
      control.current = null;
      this._ended = true;
      setTimeout(() => {
        if (control.stopMode === "final" && phrase) {
          this.onresult?.({ results: { length: 1, 0: { isFinal: true, 0: { transcript: phrase } } } });
        }
        this.onend?.();
      }, 400);
    }
    abort() {
      this._ended = true;
      if (control.current === this) control.current = null;
      setTimeout(() => this.onend?.(), 0);
    }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.__speech = control;
}

const browser = await chromium.launch({
  args: ["--no-sandbox"],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: true,
});
await context.addInitScript(fakeIosRecognition);
const page = await context.newPage();
page.setDefaultTimeout(45_000);

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

  const box = page.getByLabel("What happened on site?");
  const arrow = page.locator("[data-composer-send]");
  const mic = page.getByRole("button", { name: "Speak" });
  const stopButton = page.getByRole("button", { name: "Stop" });
  const prepare = page.getByRole("button", { name: /^Prepare Daily$/ });
  const speech = (fn, arg) => page.evaluate(fn, arg);

  console.log("\n1. Speaking fills the box as it is heard");
  await mic.click();
  await speech(() => window.__speech.say("Stripped out the old checkout counters"));
  await page.waitForFunction(() => /checkout counters/.test(document.querySelector('[name="capture_text"]').value));
  check("interim words are visible while listening", /Stripped out the old checkout counters/.test(await box.inputValue()));
  check("the box is read-only while the microphone is on", (await box.getAttribute("readonly")) !== null);
  check("the arrow cannot send while listening", await arrow.isDisabled());
  check("Prepare Daily waits while listening", await prepare.isDisabled());
  check("and says why", await page.getByText("Stop the microphone first.").isVisible());

  console.log("\n2. A pause ends the session; the next one carries on");
  await speech(() => window.__speech.end());
  await page.waitForFunction(() => window.__speech.sessions >= 2, null, { timeout: 5000 });
  await speech(() => window.__speech.say("on bays 1 to 4."));
  await page.waitForFunction(() => /bays 1 to 4/.test(document.querySelector('[name="capture_text"]').value));
  check(
    "words from both sessions are in the box, in order",
    (await box.inputValue()) === "Stripped out the old checkout counters on bays 1 to 4.",
    await box.inputValue(),
  );

  console.log("\n3. Stop hands over the last words before anything can be sent");
  await stopButton.click();
  check("the arrow stays dead while the last words are on their way", await arrow.isDisabled());
  await page.waitForFunction(() => !document.querySelector('[name="capture_text"]').readOnly, null, { timeout: 5000 });
  const settled = await box.inputValue();
  check("after stop the full transcript is in the box", settled === "Stripped out the old checkout counters on bays 1 to 4.", settled);
  check("and it is editable for review", (await box.getAttribute("readonly")) === null);
  check("and kept on the phone", (await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("siteboss:capture:"))?.[1])) === settled);

  console.log("\n4. Edit, send, and see exactly that in Today so far");
  await box.fill(`${settled} Two electricians from 7.`);
  check("the arrow is live once it is finished", await arrow.isEnabled());
  await arrow.click();
  await page.waitForFunction(() => /1 note/.test(document.body.innerText), null, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[name="capture_text"]').value === "", null, { timeout: 15_000 });
  check("the box is cleared after the server confirmed", (await box.inputValue()) === "");
  const timeline = page.locator("details", { hasText: "Today so far" });
  check("Today so far is open", (await timeline.getAttribute("open")) !== null);
  check(
    "and shows the exact submitted text",
    (await timeline.innerText()).includes("Stripped out the old checkout counters on bays 1 to 4. Two electricians from 7."),
  );

  console.log("\n5. Stop pressed in the gap between sessions still hands the words over");
  await speech(() => { window.__speech.stopMode = "silent"; });
  await mic.click();
  await speech(() => window.__speech.say("Skip swapped at 11."));
  await page.waitForFunction(() => /Skip swapped/.test(document.querySelector('[name="capture_text"]').value));
  await stopButton.click();
  await page.waitForFunction(() => !document.querySelector('[name="capture_text"]').readOnly, null, { timeout: 6000 });
  check("the words are kept even though the recogniser never ended", (await box.inputValue()) === "Skip swapped at 11.", await box.inputValue());
  await arrow.click();
  await page.waitForFunction(() => /2 notes/.test(document.body.innerText), null, { timeout: 30_000 });
  check("and send as said", (await timeline.innerText()).includes("Skip swapped at 11."));

  console.log("\n6. Nothing heard is said so, and nothing is sent");
  await speech(() => { window.__speech.stopMode = "empty"; });
  await mic.click();
  await stopButton.click();
  await page.waitForSelector("text=No words were picked up", { timeout: 6000 });
  check("a clear error is shown", await page.getByText(/No words were picked up, so nothing was added/).isVisible());
  check("the box is empty", (await box.inputValue()) === "");
  check("the arrow cannot send", await arrow.isDisabled());
  check("no note was added", /2 notes/.test(await page.locator("body").innerText()));
} catch (error) {
  failures.push(`crashed: ${String(error).slice(0, 300)}`);
  console.log("CRASH", String(error).slice(0, 300));
}

await browser.close();
console.log(`\nTENANT ${EMAIL} ${stamp}`);
console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL COMPOSER DICTATION CHECKS PASSED");
else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
