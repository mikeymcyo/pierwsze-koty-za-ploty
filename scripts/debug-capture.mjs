// Run from the SiteBoss checkout: node scripts/debug-capture.mjs [--login]
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bundled = fileURLToPath(new URL("../../browsers/", import.meta.url));
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(bundled)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;
}
const { devices, webkit } = await import("playwright");
const preview = "https://pierwsze-koty-za-ploty-git-fix-iphone-capture-f081cc-mikeymcyo.vercel.app";
const target = new URL(process.env.SITEBOSS_DEBUG_URL || preview);
const interactive = process.argv.includes("--login");
const report = { engine: "WebKit", origin: target.origin, stage: "launch" };
let browser;

// Capture media milestones without recording images, audio or credentials.
function observeCamera() {
  const log = { called: null, granted: null, rejected: null };
  window.sitebossDebug = log;
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) return;
  const original = media.getUserMedia.bind(media);
  media.getUserMedia = async (constraints) => {
    if (!constraints.video) return original(constraints);
    log.called = performance.now();
    try {
      const stream = await original(constraints);
      log.granted = performance.now();
      return stream;
    } catch (error) {
      log.rejected = error.name;
      throw error;
    }
  };
}

async function diagnose() {
  if (target.origin !== preview && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("Use the SiteBoss preview or a local test server.");
  }
  browser = await webkit.launch({ headless: !interactive });
  report.version = browser.version();
  const context = await browser.newContext(devices["iPhone 13"]);
  await context.addInitScript(observeCamera);
  const page = await context.newPage();
  report.stage = "dashboard";
  const response = await page.goto(new URL("/dashboard", target).href, { waitUntil: "domcontentloaded" });
  report.httpStatus = response?.status();
  if ([401, 403].includes(report.httpStatus) || new URL(page.url()).origin !== target.origin) return "preview_access_required";
  if (!response?.ok()) return "dashboard_http_error";
  if (new URL(page.url()).pathname === "/login") {
    report.stage = "sign_in";
    if (!interactive) return "sign_in_required";
    console.error("Sign in to SiteBoss in the WebKit window. You have two minutes.");
    await page.waitForURL(url => url.origin === target.origin && url.pathname === "/dashboard", { timeout: 120000 });
  }
  report.stage = "capture_button";
  const capture = page.getByRole("button", { name: /^Capture\b/ }).first();
  const chooseSite = page.getByRole("link", { name: /Capture.*Choose a site/i }).first();
  await capture.or(chooseSite).first().waitFor({ timeout: 15000 });
  if (!await capture.isVisible()) return "choose_a_site_first";
  await capture.tap();
  await page.getByRole("dialog", { name: "Site camera" }).waitFor();
  report.stage = "camera";
  await page.waitForFunction(() => !navigator.mediaDevices?.getUserMedia || window.sitebossDebug.rejected ||
    performance.getEntriesByName("siteboss:camera-open").length > 0, null, { timeout: 8000 })
    .catch(error => { if (error.name !== "TimeoutError") throw error; });

  const camera = await page.evaluate(() => {
    const { called, granted, rejected } = window.sitebossDebug;
    const entry = performance.getEntriesByName("siteboss:camera-open", "measure")[0];
    return {
      supported: Boolean(navigator.mediaDevices?.getUserMedia), requested: called !== null,
      grantedAfterMs: granted === null ? null : Math.round(granted - called),
      rejection: rejected, firstFrameMs: entry ? entry.duration : null,
      frameCallback: "requestVideoFrameCallback" in HTMLVideoElement.prototype,
      standalone: navigator.standalone === true || matchMedia("(display-mode: standalone)").matches,
    };
  });
  report.camera = camera;
  if (!camera.supported) return "media_api_unavailable";
  if (camera.rejection) return "camera_request_rejected";
  if (!camera.requested) return "camera_request_missing";
  if (camera.grantedAfterMs === null) return "waiting_for_permission_or_device";
  if (camera.firstFrameMs === null) return "stream_granted_no_frame";
  return camera.firstFrameMs <= 2000 ? "within_two_seconds" : "over_two_seconds";
}

try {
  report.result = await diagnose();
  const incomplete = ["sign_in_required", "preview_access_required", "choose_a_site_first", "media_api_unavailable"];
  process.exitCode = report.result === "within_two_seconds" ? 0 : incomplete.includes(report.result) ? 2 : 1;
} catch (error) {
  report.result = "diagnostic_error";
  report.error = error.name + ": " + error.message.split("\n")[0];
  process.exitCode = 1;
} finally {
  await browser?.close();
  console.log(JSON.stringify(report, null, 2));
}
