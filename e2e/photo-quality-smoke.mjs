/**
 * How sharp a photograph is by the time a client sees it in the PDF.
 *
 * The report is evidence, so the plates have to hold fine detail - a hairline
 * crack, a wet edge, the print on a label. Nothing downstream of the upload
 * re-compresses: lib/pdf/image-size.ts parses headers only and the PDF embeds
 * the stored bytes byte for byte. So the quality of a printed plate is decided
 * entirely by lib/photo-quality.ts and the canvas work in photo-upload.tsx,
 * and that is what is checked here.
 *
 * Two separate claims are proved:
 *
 *  - the resizing rules are sound (aspect kept, never upscaled, and the way
 *    down is stepped rather than one violent draw); and
 *  - 1600px really is enough, by taking the real plate geometry out of the PDF
 *    theme and working out the print resolution it lands at.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:photo-quality
 */

import { readFileSync } from "node:fs";

import { JPEG_QUALITY, MAX_EDGE, downscaleSteps, targetSize } from "../lib/photo-quality.ts";
import { fitBox, photoBoxSize } from "../lib/pdf/image-size.ts";
import { PHOTO_COLUMN_WIDTH } from "../lib/pdf/components.tsx";
import { pdfTheme } from "../lib/pdf/theme.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
/** Comments describe intentions; only code is evidence of them. */
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const PHONE_PORTRAIT = { width: 3024, height: 4032 };
const PHONE_LANDSCAPE = { width: 4032, height: 3024 };

console.log("\n1. A photograph is scaled, not reshaped");

const portrait = targetSize(PHONE_PORTRAIT);
const landscape = targetSize(PHONE_LANDSCAPE);
check("the longest edge comes down to the ceiling", portrait.height === MAX_EDGE && landscape.width === MAX_EDGE, JSON.stringify({ portrait, landscape }));
check(
  "and the shape is kept",
  Math.abs(portrait.width / portrait.height - 3024 / 4032) < 0.005 &&
    Math.abs(landscape.width / landscape.height - 4032 / 3024) < 0.005,
);
const small = targetSize({ width: 800, height: 600 });
check("a small photograph is left alone rather than blown up", small.width === 800 && small.height === 600, JSON.stringify(small));
const panorama = targetSize({ width: 9000, height: 1200 });
check("a panorama is bounded by its long edge", panorama.width === MAX_EDGE && panorama.height === 213, JSON.stringify(panorama));
check("nothing collapses to zero", targetSize({ width: 20000, height: 3 }).height >= 1);
check("and junk answers rather than throws", targetSize({ width: 0, height: 0 }).width === 0);

console.log("\n2. The way down is stepped, so detail is not thrown away");

const steps = downscaleSteps(PHONE_LANDSCAPE, landscape);
check("the chain ends at the target", steps.at(-1).width === landscape.width && steps.at(-1).height === landscape.height);
check("a phone photograph takes more than one draw", steps.length > 1, JSON.stringify(steps));
// The point of the chain: a canvas resamples from a small neighbourhood, so
// no single step may throw away more than three quarters of its input.
let from = PHONE_LANDSCAPE;
let everyStepGentle = true;
for (const step of steps) {
  if (step.width * 2 < from.width || step.height * 2 < from.height) everyStepGentle = false;
  from = step;
}
check("no step halves by more than a factor of two", everyStepGentle, JSON.stringify(steps));
check("every step is smaller than the last", steps.every((step, index) => index === 0 || step.width < steps[index - 1].width));
const huge = { width: 12000, height: 9000 };
check("a very large photograph still terminates", downscaleSteps(huge, targetSize(huge)).length >= 3);
const same = targetSize({ width: 1200, height: 900 });
check(
  "a photograph that needs no scaling is drawn once",
  downscaleSteps({ width: 1200, height: 900 }, same).length === 1,
);

console.log("\n3. 1600px is enough for A4, with room to zoom");

// Effective print resolution: stored pixels across the printed plate, in
// inches. Anything at or above 200 DPI is sharp on paper; a screen reader
// zooming into the PDF has the rest of the headroom.
function dpi(pixels, points) {
  return pixels / (points / 72);
}
const bounds = pdfTheme("siteboss").plate;
for (const [name, source] of [
  ["portrait", PHONE_PORTRAIT],
  ["landscape", PHONE_LANDSCAPE],
]) {
  const stored = targetSize(source);
  const box = photoBoxSize(stored, PHOTO_COLUMN_WIDTH, bounds);
  const printed = Math.min(dpi(stored.width, box.width), dpi(stored.height, box.height));
  check(`a ${name} plate prints above 200 DPI`, printed >= 200, `${Math.round(printed)} DPI`);
}
const cover = pdfTheme("photo").cover;
for (const [name, source] of [
  ["portrait", PHONE_PORTRAIT],
  ["landscape", PHONE_LANDSCAPE],
]) {
  const stored = targetSize(source);
  // The widest a cover ever gets: A4 less both page margins.
  const box = fitBox(stored, 595 - 80, cover.maxHeight);
  const printed = Math.min(dpi(stored.width, box.width), dpi(stored.height, box.height));
  check(`a ${name} cover prints above 200 DPI`, printed >= 200, `${Math.round(printed)} DPI`);
}

console.log("\n4. The encoder is not the thing making plates soft");

check("quality is above the point where a re-encode shows", JPEG_QUALITY >= 0.88, String(JPEG_QUALITY));
// Higher is not better here: every stored byte is fetched again later, and the
// measured gain past this point is a fifth of a decibel.
check("and not so high that every fetch pays for it", JPEG_QUALITY <= 0.92, String(JPEG_QUALITY));

console.log("\n5. The upload screen uses these rules rather than its own");

const upload = codeOf(read("../components/reports/photo-upload.tsx"));
check("the constants live in one place", /from "@\/lib\/photo-quality"/.test(upload));
check("no second ceiling is hard-coded on the screen", !/=\s*1600\b/.test(upload), upload.match(/=\s*1600\b.*/)?.[0] ?? "");
check("no second quality is hard-coded either", !/toBlob\([^)]*0\.\d+\s*\)/.test(upload));
check("the chain of sizes is walked", /for \(const step of downscaleSteps\(/.test(upload));
check("with the best resampling the browser has", /imageSmoothingQuality = "high"/.test(upload));
check("and smoothing turned on rather than assumed", /imageSmoothingEnabled = true/.test(upload));
check("the photograph is encoded once, at the end", (upload.match(/toBlob\(/g) ?? []).length === 1);
check(
  "orientation is asked for rather than left to a default",
  /imageOrientation: "from-image"/.test(upload),
);
check(
  "a failed canvas still uploads the photograph",
  /catch \{\s*return original;/.test(upload),
);

const pdfImage = codeOf(read("../lib/pdf/image-size.ts"));
check(
  "and nothing downstream re-compresses what was stored",
  !/toBlob|toDataURL|resize|quality/i.test(pdfImage),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PHOTO QUALITY CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
