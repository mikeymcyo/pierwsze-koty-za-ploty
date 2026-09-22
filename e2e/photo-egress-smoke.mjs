/**
 * What it costs to look at a photograph.
 *
 * A stored site photograph is 1200x1600 and around 700 kB. Every grid, picker
 * and arrange view in the app was fetching all of it into a tile a couple of
 * hundred pixels wide, and - worse - was fetching it again on every single
 * render, because a Supabase signed URL carries a token minted at signing time
 * and so is a different URL every time. Opening a report twice downloaded
 * every photograph twice.
 *
 * Two things fixed that, and this test guards both, plus the line neither of
 * them may cross:
 *
 *  - screens fetch a small copy written beside the photograph at upload; and
 *  - they fetch it from a stable, cacheable URL on our own origin.
 *
 * The line: the PDF is evidence and must keep reading the original object.
 * Nothing in the export path may ever reach for a thumbnail.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:photo-egress
 */

import { readFileSync } from "node:fs";

import { THUMB_EDGE, THUMB_QUALITY, targetSize } from "../lib/photo-quality.ts";
import { photoThumbUrl, thumbnailPath } from "../lib/photos.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
/** Comments describe intentions; only code is evidence of them. */
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const COMPANY = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const OBJECT = `${COMPANY}/${PROJECT}/33333333-3333-4333-8333-333333333333.jpg`;

console.log("\n1. The small copy lives beside the photograph");

const thumb = thumbnailPath(OBJECT);
check("it is a sibling, not a new tree", thumb.startsWith(`${COMPANY}/${PROJECT}/`), thumb);
// The storage policies match only the leading "{company_id}/" segment, so a
// sibling object is covered by exactly the same rules with nothing to add.
check("so the company folder still leads the path", thumb.split("/")[0] === COMPANY);
check("and it is plainly a thumbnail", thumb.endsWith(".thumb.jpg"), thumb);
check("the photograph's own path is untouched", thumb !== OBJECT);
check(
  "a name with dots in it keeps them",
  thumbnailPath(`${COMPANY}/${PROJECT}/site.photo.2026.png`).endsWith("site.photo.2026.thumb.jpg"),
);
check(
  "and one with no extension still gets a path",
  thumbnailPath(`${COMPANY}/${PROJECT}/plain`) === `${COMPANY}/${PROJECT}/plain.thumb.jpg`,
);
check("deriving it twice gives the same answer", thumbnailPath(OBJECT) === thumb);

console.log("\n2. The URL a screen uses never changes");

const url = photoThumbUrl("44444444-4444-4444-8444-444444444444");
check("it is our own origin", url.startsWith("/photos/"), url);
check("it carries no token", !/token|jwt|\?/.test(url), url);
check("it is derived from the photograph alone", url === photoThumbUrl("44444444-4444-4444-8444-444444444444"));
check("and two photographs do not share one", url !== photoThumbUrl("55555555-5555-4555-8555-555555555555"));

console.log("\n3. A tile's worth of pixels, and no more");

const stored = { width: 1200, height: 1600 };
const small = targetSize(stored, THUMB_EDGE);
check("the long edge comes down to the thumbnail ceiling", small.height === THUMB_EDGE, JSON.stringify(small));
check(
  "and the shape is kept, so nothing is cropped or stretched",
  Math.abs(small.width / small.height - stored.width / stored.height) < 0.01,
  JSON.stringify(small),
);
// The largest tile on any screen is about 200 CSS pixels; a phone draws three
// device pixels for each of them.
check("it still covers the largest tile at three times the density", THUMB_EDGE >= 200 * 3, String(THUMB_EDGE));
check("it is far smaller than the stored photograph", THUMB_EDGE < 1600 / 2);
check("and encoded for size rather than for evidence", THUMB_QUALITY < 0.8, String(THUMB_QUALITY));
// Bytes scale with area, so this is the shape of the saving before the lower
// quality is counted at all.
const areaRatio = (small.width * small.height) / (stored.width * stored.height);
check("which is roughly a sixth of the pixels or fewer", areaRatio <= 0.2, areaRatio.toFixed(3));

console.log("\n4. The screens stopped minting a URL per render");

for (const [name, file] of [
  ["the project page", "../app/(app)/projects/[id]/page.tsx"],
  ["the report page", "../app/(app)/reports/[id]/page.tsx"],
  ["the capture screen", "../app/(app)/reports/[id]/capture/page.tsx"],
  ["the summary report", "../app/(app)/summary-reports/[id]/page.tsx"],
]) {
  const source = codeOf(read(file));
  check(`${name} uses the stable URL`, /photoThumbUrl\(/.test(source));
  check(`${name} no longer signs one per render`, !/signPhotoUrls/.test(source));
}

console.log("\n5. The route serves it privately, and never fails a screen");

const route = codeOf(read("../app/(app)/photos/[id]/thumb/route.ts"));
check("a session is required", /requireSessionContext\(\)/.test(route));
// RLS confines public.photos to the caller's company, so the row lookup is
// the authorisation. Nothing about who may see a photograph is in the URL.
check("the row is read under the caller's own session", /from\("photos"\)/.test(route));
check("with no service role anywhere near it", !/service_role|SERVICE_ROLE|serviceRole/.test(route));
check("nothing in between may keep it", /"cache-control": "private,/.test(route));
check("but the browser may, for good", /immutable/.test(route) && /max-age=31536000/.test(route));
check("a photograph with no thumbnail still shows", /download\(photo\.storage_path\)/.test(route));
check("and a missing photograph is a 404 rather than a crash", /status: 404/.test(route));

console.log("\n6. The PDF still reads the photograph itself");

for (const [name, file] of [
  ["the draft preview", "../app/(app)/reports/[id]/preview/route.ts"],
  ["finalising", "../app/(app)/reports/finalise-actions.ts"],
  ["the summary PDF", "../lib/summary-reports/pdf-data.ts"],
]) {
  const source = codeOf(read(file));
  check(`${name} downloads the original object`, /download\(photo\.storage_path\)/.test(source));
  check(`${name} never reaches for a thumbnail`, !/thumbnailPath|\.thumb\./.test(source));
}
const pdfData = codeOf(read("../lib/pdf/report-data.ts"));
check("and the PDF's own data layer knows nothing about thumbnails", !/thumb/i.test(pdfData));

console.log("\n7. A thumbnail is a convenience, never a photograph lost");

const upload = codeOf(read("../components/reports/photo-upload.tsx"));
check("one is written beside the photograph", /upload\(thumbnailPath\(item\.path\)/.test(upload));
check("after the photograph itself", upload.indexOf("upload(item.path") < upload.indexOf("thumbnailPath(item.path"));
check("and a failure to write it is swallowed", /thumbnailPath\(item\.path\)[\s\S]{0,320}?\.catch\(/.test(upload));
check("the photograph is still stored at full quality", /encode\(canvas, JPEG_QUALITY\)/.test(upload));
check("and the thumbnail at its own", /encode\(canvas, THUMB_QUALITY\)/.test(upload));
check(
  "both come off one decode of the file",
  (upload.match(/createImageBitmap\(file/g) ?? []).length === 1,
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PHOTO EGRESS CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
