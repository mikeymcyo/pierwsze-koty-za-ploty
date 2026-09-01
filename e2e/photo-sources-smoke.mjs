/**
 * Test for the three media sources on the photo uploader.
 *
 * The bug this guards against is invisible to a storage test: an input with
 * capture="environment" uploads perfectly well from a desktop file picker and
 * sends an iPhone straight to the camera with no route to the photo library.
 * What matters is the attributes the browser ends up parsing, so that is what
 * is asserted - in a real Chromium, not by reading strings.
 *
 * Deliberately needs no Supabase and no dev server, so it runs anywhere:
 *
 *   npm run test:photo-sources
 *
 * The live-page half of this - the buttons on the real capture screen, a real
 * multi-file upload, and project-level photos - is in photos-smoke.mjs, which
 * does need both.
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";

import {
  PHOTO_SOURCES,
  isSupportedImageFile,
  photoSource,
} from "../lib/photo-sources.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const PNG_2X2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
  "base64",
);
const file = (name) => ({ name, mimeType: "image/png", buffer: PNG_2X2 });

console.log("\n1. The source table offers exactly the three choices");
check(
  "three sources",
  PHOTO_SOURCES.length === 3,
  PHOTO_SOURCES.map((s) => s.id).join(", "),
);
check(
  "labelled the way iOS words them",
  PHOTO_SOURCES.map((s) => s.label).join(" | ") ===
    "Take Photo | Choose from Photo Library | Choose File",
  PHOTO_SOURCES.map((s) => s.label).join(" | "),
);

console.log("\n2. Each source carries the attributes its job needs");
const camera = photoSource("camera");
const library = photoSource("library");
const files = photoSource("files");

check("camera opens the rear camera", camera.capture === "environment", String(camera.capture));
check("camera takes one shot at a time", camera.multiple === false);
check("library does NOT force the camera", library.capture === undefined, String(library.capture));
check("library takes several photos at once", library.multiple === true);
check("library is limited to images", library.accept === "image/*", library.accept);
check("files does NOT force the camera", files.capture === undefined, String(files.capture));
check("files takes several at once", files.multiple === true);
check(
  "files also names extensions, for a Files pick with no MIME type",
  files.accept.includes("image/*") && files.accept.includes(".heic"),
  files.accept,
);

console.log("\n3. The file-type guard");
const guardCases = [
  ["a JPEG", { name: "site.jpg", type: "image/jpeg" }, true],
  ["a PNG", { name: "site.png", type: "image/png" }, true],
  ["a HEIC with no MIME type", { name: "IMG_0421.HEIC", type: "" }, true],
  ["a HEIC as octet-stream", { name: "IMG_0421.heic", type: "application/octet-stream" }, true],
  ["a PDF", { name: "drawing.pdf", type: "application/pdf" }, false],
  ["a spreadsheet", { name: "valuation.xlsx", type: "application/vnd.ms-excel" }, false],
  ["a mislabelled octet-stream", { name: "notes.txt", type: "application/octet-stream" }, false],
  ["a video", { name: "clip.mov", type: "video/quicktime" }, false],
];
for (const [label, candidate, expected] of guardCases) {
  check(`${label} is ${expected ? "accepted" : "refused"}`, isSupportedImageFile(candidate) === expected);
}

console.log("\n4. The uploader wires every source to its own input");
const component = readFileSync(new URL("../components/reports/photo-upload.tsx", import.meta.url), "utf8");
check("it maps over the shared table", component.includes("PHOTO_SOURCES.map("));
check(
  "no source hardcodes capture any more",
  !/capture="environment"/.test(component),
  "a literal capture=\"environment\" is back in the component",
);
for (const attribute of ["accept={source.accept}", "multiple={source.multiple}", "data-photo-source={source.id}"]) {
  check(`the input takes ${attribute} from the table`, component.includes(attribute));
}
check(
  "capture is spread only when the source has one",
  component.includes("...(source.capture ? { capture: source.capture } : {})"),
);
check(
  "one file input, rendered once per source",
  (component.slice(component.indexOf("PHOTO_SOURCES.map(")).match(/type="file"/g) ?? []).length === 1,
);
// Site Capture's single "Add photos" button is the one exception: a second
// input, outside the map, with no capture attribute at all - which is exactly
// what makes iOS offer Take Photo, Photo Library and Choose File itself.
const simpleInput = component.slice(component.indexOf('data-photo-source-button="simple"'), component.indexOf("PHOTO_SOURCES.map("));
check("Site Capture's one Add photos button has its own input", (simpleInput.match(/type="file"/g) ?? []).length === 1);
check("and that input does NOT force the camera", !/capture/.test(simpleInput.replace(/\/\*[\s\S]*?\*\//g, "")), "no capture attribute, so the phone shows its own sheet");
check("and takes several photos at once", /multiple=\{simpleSource\.multiple\}/.test(simpleInput) && /id === "files"/.test(component));
check("and there are exactly two inputs in the file", (component.match(/type="file"/g) ?? []).length === 2);

console.log("\n5. A real browser parses those attributes the way we expect");
const launchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // The same attribute values the component hands React, put in front of a
  // real HTML parser.
  await page.setContent(
    `<body>${PHOTO_SOURCES.map(
      (source) =>
        `<input type="file" data-photo-source="${source.id}" accept="${source.accept}"` +
        `${source.capture ? ` capture="${source.capture}"` : ""}` +
        `${source.multiple ? " multiple" : ""}>`,
    ).join("")}</body>`,
  );

  for (const source of PHOTO_SOURCES) {
    const input = page.locator(`input[data-photo-source="${source.id}"]`);
    const parsed = await input.evaluate((el) => ({
      accept: el.accept,
      multiple: el.multiple,
      capture: el.getAttribute("capture"),
    }));

    check(`${source.id}: accept survives parsing`, parsed.accept === source.accept, parsed.accept);
    check(`${source.id}: multiple is ${source.multiple}`, parsed.multiple === source.multiple);
    check(
      `${source.id}: capture is ${source.capture ?? "absent"}`,
      parsed.capture === (source.capture ?? null),
      String(parsed.capture),
    );
  }

  console.log("\n6. Multi-select really is multi-select");
  const libraryInput = page.locator('input[data-photo-source="library"]');
  await libraryInput.setInputFiles([file("one.png"), file("two.png"), file("three.png")]);
  check(
    "the library input holds three photos at once",
    (await libraryInput.evaluate((el) => el.files.length)) === 3,
  );

  const filesInput = page.locator('input[data-photo-source="files"]');
  await filesInput.setInputFiles([file("a.png"), file("b.png")]);
  check(
    "so does Choose File",
    (await filesInput.evaluate((el) => el.files.length)) === 2,
  );

  // Not a nicety: a camera input that accepted a second file would be
  // promising a burst mode the camera does not give us.
  let rejected = false;
  try {
    await page
      .locator('input[data-photo-source="camera"]')
      .setInputFiles([file("one.png"), file("two.png")]);
  } catch {
    rejected = true;
  }
  check("the camera input refuses a second file", rejected);
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.log(`\n  [FAIL] ${error.message}`);
} finally {
  await browser.close();
}

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PHOTO SOURCE CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
