/**
 * Replacing the image of a photograph that is already in a report.
 *
 * What is checked is the promise: the photograph keeps its identity and
 * everything written about it; only the image moves; the row never points at
 * a file that is not there; an issued report refuses; and the phone is not
 * left showing the old picture from its cache.
 *
 *   npm run test:photo-replace
 */

import { readFileSync } from "node:fs";

import { imageVersion, photoThumbUrl } from "../lib/photos.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. A new image is a new thumbnail URL; a caption edit is not");

const id = "44444444-4444-4444-8444-444444444444";
const before = "c/p/0133d503-a6a7-41d3-b000-000000000001.jpg";
const after = "c/p/9f1e2d3c-4b5a-4c6d-8e7f-000000000002.jpg";
check("the URL carries the image's own name", photoThumbUrl(id, before) === `/photos/${id}/thumb?v=0133d503-a6a7-41d3-b000-000000000001`);
check("so a replaced image changes it", photoThumbUrl(id, before) !== photoThumbUrl(id, after));
check("and the same image keeps it", photoThumbUrl(id, before) === photoThumbUrl(id, before));
check("with no path it is the plain URL, as before", photoThumbUrl(id) === `/photos/${id}/thumb`);
check("a strange name never reaches the URL", imageVersion("c/p/a b?c.jpg") === null && imageVersion("c/p/.jpg") === null && imageVersion("c/p/x&y.jpg") === null);
for (const page of ["../app/(app)/reports/[id]/page.tsx", "../app/(app)/reports/[id]/capture/page.tsx", "../app/(app)/projects/[id]/page.tsx", "../app/(app)/summary-reports/[id]/page.tsx"]) {
  check(`${page.split("/(app)/")[1]} versions its thumbnails by image`, /photoThumbUrl\(photo\.id, photo\.storage_path\)/.test(read(page)));
}

console.log("\n2. The server moves the row onto the new image, and only then");

const actions = read("../app/(app)/reports/photo-actions.ts");
const replace = actions.slice(actions.indexOf("export async function replacePhoto("), actions.indexOf("const detailsSchema"));
const code = codeOf(replace);
check("an issued report refuses", /if \(owner\?\.status === "final"\) return \{ error: REPORT_IS_FINAL \};/.test(code));
check("so does a photograph printed in an issued consolidated report", /issuedDependents\(await dependentsOfPhoto\(supabase, photoId\)\)/.test(code));
check("the new path must be in this company's folder for this project", /photoPathPrefix\(session\.companyId, photo\.project_id\)/.test(code) && /!storagePath\.startsWith\(prefix\)/.test(code));
check("under a fresh UUID name, never the image it already has", /REPLACEMENT_NAME\.test\(name\)/.test(code) && /storagePath === photo\.storage_path/.test(code));
check("the new object is confirmed in storage before anything points at it", code.indexOf(".list(") > 0 && code.indexOf(".list(") < code.indexOf(".update("));
check("one update, guarded on the image it was read with", /\.update\(\{ storage_path: storagePath, width, height, rotation: 0 \}\)\s*\.eq\("id", photoId\)\s*\.eq\("storage_path", photo\.storage_path\)/.test(code));
check("only image fields are written: no caption, status, order, report or pairing", !/caption|category|sort_order|report_id:|project_id:|pair_/.test(code.slice(code.indexOf(".update("), code.indexOf(".update(") + 120)));
check("the old image is removed only after the update landed", code.indexOf(".remove([photo.storage_path") > code.indexOf("if (!moved)"));
check("and failing to remove it is not a failure", /\.remove\(\[photo\.storage_path, thumbnailPath\(photo\.storage_path\)\]\)\s*\.catch\(/.test(code));

console.log("\n3. The screen: same compression, fresh name, old image kept until it is done");

const screen = read("../components/reports/photo-replace.tsx");
const screenCode = codeOf(screen);
check("the new image goes through the uploader's own compression", /import \{ compress \} from "@\/components\/reports\/photo-upload"/.test(screen) && /await compress\(file\)/.test(screenCode));
check("to a fresh UUID path in the same folder, never over the old one", /\$\{folder\}\$\{crypto\.randomUUID\(\)\}\.jpg/.test(screenCode) && /upsert: false/.test(screenCode) && !/upsert: true/.test(screenCode));
check("the thumbnail beside it, a failure there swallowed", /upload\(thumbnailPath\(path\), thumb/.test(screenCode));
check("the server is asked only after the upload", screenCode.indexOf(".upload(path") < screenCode.indexOf("replacePhoto(photoId"));
check("new files are taken back only when the server said no", /if \(result\.error\) \{\s*await supabase\.storage\s*\.from\(PHOTO_BUCKET\)\s*\.remove\(\[path, thumbnailPath\(path\)\]\)/.test(screenCode));
check("and left alone when the answer never came", !/catch \(cause\) \{[\s\S]{0,400}\.remove\(/.test(screenCode));
check("the words say what is kept", /Replace this photo\? Caption, status and report details will be kept\./.test(screen));

const grid = read("../components/reports/photo-grid.tsx");
check("offered only where the photograph is editable", /\{editable && replacing !== photo\.id \? \(/.test(grid) && /\{editable && replacing === photo\.id \? \(/.test(grid));
check("a new image drops an AI suggestion made from the old one", /key=\{photo\.storage_path\}\s*photoId=\{photo\.id\}/.test(grid));

console.log("\n4. Nothing else moved");

const uploader = read("../components/reports/photo-upload.tsx");
check("the normal uploader still sends one selection straight through", /await send\(pending, skippedNote\)/.test(uploader) && /Uploading \{busy\.done\} of \{busy\.total\}/.test(uploader));
check("its compression is only exported, not changed", /export async function compress\(file: File\): Promise<Compressed>/.test(uploader));
check("no queue anywhere", !/indexedDB|photo-queue|securePhotos/i.test(uploader + screen));
check("the approved phone layout is intact", /"grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"/.test(grid));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("All checks passed.");
} else {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  FAILED: ${failure}`);
  process.exitCode = 1;
}
