/**
 * The export batch: sharing an issued PDF, the three styles, the cover
 * photograph, quieter repeating branding, and the sign-off block.
 *
 * Run with the TSX loader:
 *   npm run test:export
 *
 * The rules are pure and checked directly. The documents are then expanded
 * with real props - the tree, one step before the renderer - because a
 * rendered PDF subsets its fonts and cannot be searched for words. Real A4
 * renders at the end prove the styles paginate and that a cover does not
 * quietly cost every report an extra page.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";

import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

import { LANDSCAPE, PORTRAIT, png } from "./support/fixture-image.mjs";
import { nodesOf, textJoined } from "./support/pdf-tree.mjs";

import {
  DEFAULT_PDF_STYLE,
  PDF_STYLES,
  PDF_STYLE_DESCRIPTIONS,
  PDF_STYLE_LABELS,
  coverPhotoIdOf,
  describePresentation,
  isPdfStyle,
  pdfStyleOf,
  issuedPdfFileName,
  pickCoverPhoto,
} from "../lib/pdf/presentation.ts";
import { fitBox, imageSize, photoBoxSize } from "../lib/pdf/image-size.ts";
import {
  DEFAULT_PHOTO_LAYOUT,
  PHOTO_LAYOUTS,
  PLATE_CHROME_HEIGHT,
  USABLE_PAGE_HEIGHT,
  columnWidthFor,
  isPhotoLayout,
  photoLayoutOf,
  planPhotoRows,
} from "../lib/pdf/photo-layout.ts";
import { createPdfStyles, pdfTheme } from "../lib/pdf/theme.ts";

import { ReportDocument } from "../lib/pdf/report-document.tsx";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

const photo = (id, caption, category, data) => ({ id, caption, category, data });

function daily(overrides = {}) {
  return {
    companyName: "Empire Interiors Ltd",
    projectName: "South Croydon",
    client: "Riverside Developments Ltd",
    siteAddress: "14 Wharf Road, South Croydon",
    projectReference: "1470",
    reportNumber: "009",
    reportDate: "29 August 2026",
    weather: "Dry, 18C",
    authorName: "M. Korzeniak",
    finalisedAt: "29 August 2026",
    workforce: [{ company_name: "Groundworks Ltd", trade: "Groundworks", operatives: 6 }],
    plant: [],
    sections: [
      { type: "work_completed", label: "Works completed", content: "Ducting laid to the east." },
    ],
    issues: [],
    photos: [],
    supportingDocuments: [],
    documentsAppended: false,
    store: null,
    ...overrides,
  };
}

function summary(kind, overrides = {}) {
  return {
    kind,
    companyName: "Empire Interiors Ltd",
    projectName: "South Croydon",
    client: "Riverside Developments Ltd",
    siteAddress: "14 Wharf Road, South Croydon",
    projectReference: "1470",
    title: null,
    number: "007",
    revision: 2,
    periodLabel: "1 to 28 August 2026",
    issuedAt: "29 August 2026",
    issuedBy: "M. Korzeniak",
    sections: [{ type: "summary", label: "Summary", content: "The works remain on programme." }],
    issues: [],
    photos: [],
    sourceLabels: [],
    supportingDocuments: [],
    documentsAppended: false,
    store: null,
    ...overrides,
  };
}

const PHOTOS = [
  photo("p1", "Loading bay before works", "before", LANDSCAPE),
  photo("p2", "Duct route at grid 4", "general", PORTRAIT),
];

const pages = async (element) =>
  (await PDFDocument.load(await renderToBuffer(element))).getPageCount();

// ---------------------------------------------------------------------------

console.log("\n1. Three styles, fixed, and nothing that behaves like a designer");
check("exactly three", PDF_STYLES.length === 3 && PDF_STYLES.join() === "siteboss,corporate,photo");
check("the house style is the default", DEFAULT_PDF_STYLE === "siteboss");
check(
  "each is named and explained",
  PDF_STYLES.every((key) => PDF_STYLE_LABELS[key] && PDF_STYLE_DESCRIPTIONS[key]),
);
check("a known style is recognised", PDF_STYLES.every(isPdfStyle));
check("and an invented one is not", !isPdfStyle("neon") && !isPdfStyle("") && !isPdfStyle(null));
check(
  "an unrecognised value falls back rather than failing to issue",
  pdfStyleOf("neon") === "siteboss" &&
    pdfStyleOf(null) === "siteboss" &&
    pdfStyleOf(undefined) === "siteboss" &&
    pdfStyleOf("") === "siteboss",
);
check("a real choice survives", pdfStyleOf("corporate") === "corporate" && pdfStyleOf("photo") === "photo");
const rules = read("../lib/pdf/presentation.ts");
// A type-only import is erased by the compiler, so it costs the browser
// nothing; what must never appear is a runtime one, which would drag whatever
// it names into the picker's bundle.
check("the rules import nothing at runtime", !/^import (?!type )/m.test(rules));
check("so the picker can use them without the renderer", !/@\//.test(rules));
const layoutRules = read("../lib/pdf/photo-layout.ts");
check("and neither does the layout it names", !/^import /m.test(layoutRules) && !/@\//.test(layoutRules));
check(
  "no colour picker crept in",
  !/#[0-9a-f]{6}/i.test(rules) && !/colou?rPicker|customColou?r/i.test(rules),
);

console.log("\n2. The styles are actually different documents");
const themes = Object.fromEntries(PDF_STYLES.map((key) => [key, pdfTheme(key, "standard")]));
check(
  "corporate drops the amber",
  themes.corporate.colors.accent !== themes.siteboss.colors.accent &&
    !/f6b800/i.test(themes.corporate.colors.accent),
);
check("and softens the rule", themes.corporate.colors.rule !== themes.siteboss.colors.rule);
check("siteboss keeps it", /f6b800/i.test(themes.siteboss.colors.accent));
check("photo keeps the house colours", themes.photo.colors.accent === themes.siteboss.colors.accent);
check(
  "photo gives the cover far more of the page",
  themes.photo.cover.maxHeight > themes.siteboss.cover.maxHeight * 1.5,
);
check(
  "and prints bigger plates",
  themes.photo.plate.max > themes.siteboss.plate.max &&
    themes.corporate.plate.max === themes.siteboss.plate.max,
);
check(
  "density is the document's business, not the style's",
  pdfTheme("photo", "compact").density === "compact" &&
    pdfTheme("photo", "standard").density === "standard" &&
    pdfTheme("photo", "compact").colors.accent === pdfTheme("photo", "standard").colors.accent,
);
check("every style builds a stylesheet", PDF_STYLES.every((key) => createPdfStyles(pdfTheme(key))));

console.log("\n3. The repeating branding is quiet");
const s = createPdfStyles(pdfTheme("siteboss", "compact"));
check("the product name is small", s.headerBrand.fontSize <= 7.5, String(s.headerBrand.fontSize));
check("and grey rather than black", s.headerBrand.color !== s.docType.color);
check(
  "the document title outweighs it several times over",
  s.docType.fontSize >= s.headerBrand.fontSize * 2,
);
check("the project line outweighs it too", s.docProject.fontSize > s.headerBrand.fontSize);
check("the rule is a hairline, not a band", s.rule.height <= 1.5);
const fixed = nodesOf(createElement(ReportDocument, { data: daily() })).filter(
  (node) => node.props?.fixed,
);
check(
  "the header and footer still repeat on every page",
  fixed.length >= 2 && fixed.some((node) => textJoined(node).includes("SiteBoss Pro")),
);
const brandText = textJoined(createElement(ReportDocument, { data: daily() }));
check("and still says who issued it", brandText.includes("Empire Interiors Ltd"));
check("and what produced it", brandText.includes("SiteBoss Pro"));

console.log("\n4. The cover photograph");
check("no cover is the default", coverPhotoIdOf(undefined) === null && coverPhotoIdOf("") === null);
check("and stays valid when said explicitly", coverPhotoIdOf("none") === null);
check("a chosen one is carried", coverPhotoIdOf(" p2 ") === "p2");
check("the cover is one of the report's own plates", pickCoverPhoto(PHOTOS, "p2")?.id === "p2");
check(
  "a photograph that is no longer there simply means no cover",
  pickCoverPhoto(PHOTOS, "gone") === null && pickCoverPhoto([], "p1") === null,
);
const withCover = createElement(ReportDocument, {
  data: daily({ photos: PHOTOS, coverPhotoId: "p1" }),
});
const withoutCover = createElement(ReportDocument, { data: daily({ photos: PHOTOS }) });
const images = (element) => nodesOf(element).filter((node) => node.props?.src);
check("a cover adds one image to the page", images(withCover).length === images(withoutCover).length + 1);
check(
  "and it is the photograph's own bytes, not a copy",
  images(withCover).some((node) => node.props.src === LANDSCAPE),
);
check(
  "the plate is still in the evidence, so the record is complete",
  images(withCover).filter((node) => node.props.src === LANDSCAPE).length === 2,
);
check(
  "the cover carries what the photograph is of",
  textJoined(withCover).includes("Loading bay before works"),
);
check("no cover renders no cover", images(withoutCover).length === 2);
const portraitCover = fitBox(imageSize(PORTRAIT), 515, 310);
check("a portrait cover stays portrait", portraitCover.height > portraitCover.width);
const landscapeCover = fitBox(imageSize(LANDSCAPE), 515, 310);
check("a landscape cover stays landscape", landscapeCover.width > landscapeCover.height);
check("nothing is stretched", Math.abs(landscapeCover.width / landscapeCover.height - 1600 / 1067) < 0.02);
check("and nothing overflows the page", landscapeCover.width <= 515 && portraitCover.height <= 310);
const panorama = fitBox(imageSize(png(3000, 600)), 515, 310);
check("a panorama fits the width rather than the height", panorama.width === 515);
check("an unreadable image still gets a box", fitBox(null, 515, 310).width > 0);
check(
  "the picker says what will be issued",
  /no photographs/.test(describePresentation({ style: "siteboss", hasCover: false, photoCount: 0 })) &&
    /rather than on a photograph/.test(
      describePresentation({ style: "corporate", hasCover: false, photoCount: 3 }),
    ) &&
    /full width/.test(describePresentation({ style: "photo", hasCover: true, photoCount: 3 })) &&
    /across the head of the first page/.test(
      describePresentation({ style: "siteboss", hasCover: true, photoCount: 3 }),
    ),
);

console.log("\n5. Sign-off: a place to sign, and no more than that");
for (const [name, element] of [
  ["daily", createElement(ReportDocument, { data: daily() })],
  ["survey", createElement(SummaryReportDocument, { data: summary("survey") })],
  ["progress", createElement(SummaryReportDocument, { data: summary("progress") })],
  ["completion", createElement(SummaryReportDocument, { data: summary("completion") })],
]) {
  const text = textJoined(element);
  check(
    `the ${name} report has prepared by, signature and date`,
    text.includes("Prepared by") && text.includes("Signature") && text.includes("Date"),
  );
  check(
    `the ${name} report claims no approval`,
    !/\b(approved|accepted|certifies|certified|signed off by the client)\b/i.test(text),
  );
}
const signOffText = textJoined(createElement(ReportDocument, { data: daily() }));
check("it says what it is not", /not an approval/i.test(signOffText));
check(
  "the author is the one already recorded",
  signOffText.includes("M. Korzeniak"),
);
check(
  "and nobody is invented where no author is recorded",
  !textJoined(createElement(ReportDocument, { data: daily({ authorName: null }) })).includes(
    "M. Korzeniak",
  ),
);
const view = read("../lib/pdf/components.tsx");
check(
  "the signature and date lines are left blank",
  /signOffLine/.test(view) && !/new Date\(\)/.test(view),
);

console.log("\n6. Sharing sends the issued file, and never re-renders it");
const dailyFileRoute = read("../app/(app)/reports/[id]/file/route.ts");
const summaryFileRoute = read("../app/(app)/summary-reports/[id]/file/route.ts");
for (const [name, route] of [["daily", dailyFileRoute], ["summary", summaryFileRoute]]) {
  check(`the ${name} share route renders nothing`, !/render[A-Za-z]*Pdf/.test(route));
  check(`the ${name} share route reads the stored file`, /storedPdf/.test(route));
  check(`the ${name} share route needs a session`, /requireSessionContext/.test(route));
  check(`a draft has nothing to share`, /pdf_path\b[\s\S]{0,200}404/.test(route));
  check(`the ${name} file is sent as an attachment`, /attachment; filename=/.test(route));
}
check(
  "the file is named after the document, not download.pdf",
  issuedPdfFileName("Daily Report", "009", "2026-08-29") === "Daily Report 009 2026-08-29.pdf",
);
check(
  "and a name a filesystem would reject is cleaned up",
  issuedPdfFileName("Progress/Report", "007", null) === "Progress Report 007.pdf",
);
check("with a fallback rather than an empty name", issuedPdfFileName("", "", null) === "Report.pdf");
const share = read("../components/pdf/share-pdf.tsx");
check("the share sheet is used where the device has one", /navigator\.canShare/.test(share) && /navigator\.share/.test(share));
check("and the file is saved where it does not", /download = fileName|link\.download/.test(share));
check(
  "the fetch starts on the press, so iOS still counts it as a tap",
  /onPointerDown/.test(share),
);
check("cancelling a share is not an error", /AbortError/.test(share));
check(
  "it fetches the stored file and never a preview",
  !/\/preview/.test(share) && /fetch\(href/.test(share),
);

console.log("\n7. Wired into the screens");
const finalise = read("../components/reports/finalise-report.tsx");
const summaryFinalise = read("../components/summary-reports/summary-finalise.tsx");
for (const [name, file] of [["daily", finalise], ["consolidated", summaryFinalise]]) {
  check(`the ${name} finalise screen offers the presentation`, /<PdfPresentation/.test(file));
  check(
    `the ${name} choice reaches the render`,
    /name="pdfStyle"/.test(file) && /name="coverPhoto"/.test(file),
  );
  check(`the ${name} preview shows the same choice`, /\$\{presentation\}/.test(file));
  check(`the ${name} issued report can be shared`, /<SharePdf/.test(file));
  check(`the ${name} default is the house style with no cover`, /DEFAULT_PDF_STYLE/.test(file) && /useState<PdfStyle>/.test(file));
}
const viewer = read("../components/pdf/pdf-viewer.tsx");
check("the viewer shares only a stored file", /shareHref \? \(/.test(viewer));
// Live iPhone testing found no Share button on the reader. It was there,
// under the app's glass header: the page wrapper's fade animation makes a
// stacking context, so the fixed reader was layered as its wrapper, beneath
// the top bar and the bottom nav. The reader now renders from the body, and
// Share is a filled button rather than a ghost beside the title.
check("the reader renders from the body, above the app's own chrome", /createPortal\(/.test(viewer) && /document\.body,?\s*\)/.test(viewer));
check("and Share is a filled button, not a ghost", /<SharePdf[\s\S]*?variant="secondary"[\s\S]*?size="sm"/.test(viewer) && !/variant="ghost"\s*\n\s*size="sm"/.test(viewer));
// The same testing found the photographs soft. Not in the file - the plate is
// the stored 1600px JPEG byte for byte - but on the screen: every page was
// drawn once at a density capped at 2x and magnified by stretching, so a
// plate reached a 3x iPhone through a canvas a third the size of the pixels
// under it. Pages are now drawn at the screen's density and the current
// magnification, and only the ones near the viewport, so the memory that
// forced the cap is never asked for.
check("pages are drawn at the screen's full density", /MAX_DEVICE_SCALE = 3/.test(viewer));
check("and redrawn at the magnification chosen, not stretched to it", /const \{ width \} = cssSize\(slot, fitRef\.current, zoomRef\.current\);\s*\n\s*const density/.test(viewer) && /\(width \/ slot\.width\) \* density/.test(viewer));
check("only the pages near the viewport hold a canvas", /new IntersectionObserver\(/.test(viewer) && /release\(slot\)/.test(viewer));
check("with a ceiling on one page's pixels so iOS never hands back a blank", /MAX_CANVAS_PIXELS/.test(viewer) && /Math\.sqrt\(MAX_CANVAS_PIXELS \/ pixels\)/.test(viewer));
check("the zoom steps are unchanged", /ZOOM_STEPS = \[1, 1\.5, 2, 3\]/.test(viewer));
const dailyPdfPage = read("../app/(app)/reports/[id]/pdf/page.tsx");
check(
  "a draft preview is never offered for sharing",
  /showingIssued && report\.pdf_path/.test(dailyPdfPage),
);
const actions = read("../app/(app)/reports/finalise-actions.ts");
check("the finalise action honours the choice", /pdfStyleOf\(String\(formData\.get\("pdfStyle"/.test(actions));
check("and the cover", /coverPhotoIdOf\(String\(formData\.get\("coverPhoto"/.test(actions));

console.log("\n8. Nothing was stored to make any of it work");
const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url));
check(
  "no migration was added for any of it",
  !migrations.some((file) => /style|cover|presentation|share/i.test(file)) &&
    !migrations.some((file) =>
      /pdf_style|cover_photo/.test(read(`../supabase/migrations/${file}`)),
    ),
);
check(
  "the style is not a column on a report",
  !/pdf_style|cover_photo/.test(read("../types/database.ts")),
);
check(
  // Which bytes the viewer is pointed at moved into lib/pdf/viewer-source.ts
  // when the reader became a full-screen one; e2e/report-viewer-smoke.mjs
  // covers that rule case by case. What matters here is unchanged: this page
  // reaches an issued PDF through the stored file and never through a render.
  "and the issued PDF is still whatever was stored",
  /viewerSource/.test(dailyPdfPage) && !/renderReportPdf/.test(dailyPdfPage),
);
check(
  "the source rule sends an issued report to the stored file",
  /showingIssued: true, src: state\.pdfPath \? `\$\{base\}\/file`/.test(
    read("../lib/pdf/viewer-source.ts"),
  ),
);

console.log("\n9. Real renders");
const counts = {};
for (const style of PDF_STYLES) {
  counts[`daily-${style}`] = await pages(
    createElement(ReportDocument, { data: daily({ style, photos: PHOTOS, coverPhotoId: "p1" }) }),
  );
  counts[`completion-${style}`] = await pages(
    createElement(SummaryReportDocument, {
      data: summary("completion", { style, photos: PHOTOS, coverPhotoId: "p2" }),
    }),
  );
}
counts["daily-plain"] = await pages(createElement(ReportDocument, { data: daily() }));
counts["daily-cover-only"] = await pages(
  createElement(ReportDocument, { data: daily({ photos: PHOTOS, coverPhotoId: "p1" }) }),
);
counts["survey"] = await pages(
  createElement(SummaryReportDocument, {
    data: summary("survey", { style: "photo", photos: PHOTOS, coverPhotoId: "p1" }),
  }),
);
for (const [name, count] of Object.entries(counts)) console.log(`     ${name}: ${count} page(s)`);
check("every style renders", Object.values(counts).every((count) => count >= 1));
check("a report with a sign-off and nothing else is still one page", counts["daily-plain"] === 1);
check(
  "a cover and two plates stay within two pages in the house style",
  counts["daily-siteboss"] <= 2,
);
check("corporate costs no more pages than the house style", counts["corporate"] === undefined || counts["daily-corporate"] <= counts["daily-siteboss"]);
check("the photo style spends its extra room on the photographs", counts["daily-photo"] >= counts["daily-siteboss"]);
check("a survey with a cover still renders", counts["survey"] >= 1);

// ---------------------------------------------------------------------------
console.log("\n10. The photographs are given the page");

check("two arrangements, and no more", PHOTO_LAYOUTS.length === 2 && PHOTO_LAYOUTS.join() === "standard,focus");
check("standard is what a report prints as by default", DEFAULT_PHOTO_LAYOUT === "standard");
check(
  "an absent, empty or mistyped layout falls back rather than failing",
  photoLayoutOf(undefined) === "standard" && photoLayoutOf("") === "standard" && photoLayoutOf("collage") === "standard",
);
check("a real choice survives", photoLayoutOf("focus") === "focus" && isPhotoLayout("standard"));

const P = { width: 1080, height: 1620 };  // a 2:3 phone portrait
const L = { width: 1600, height: 1067 };  // a 3:2 landscape
const shapes = (kinds) => kinds.map((k) => ({ portrait: k === "P" }));
const plate = (row, kind) => photoBoxSize(kind === "L" ? L : P, row.columnWidth, row.bounds);

// The arrangement this replaced: two fixed columns, every plate capped at
// 190pt. It is the thing the sizes below have to beat.
const BEFORE = { columnWidth: 238, bounds: { min: 110, max: 190 } };
const beforePortrait = photoBoxSize(P, BEFORE.columnWidth, BEFORE.bounds);
check(
  "the old grid really did shrink a portrait photograph to a strip",
  beforePortrait.width === 127 && beforePortrait.height === 190,
  `${beforePortrait.width}x${beforePortrait.height}`,
);

const mix = Array.from({ length: 25 }, (_, i) => (i % 4 === 3 ? "L" : "P"));
const std = planPhotoRows(shapes(mix), "standard");
const foc = planPhotoRows(shapes(mix), "focus");

check(
  "the order of the photographs is never touched",
  std.flatMap((r) => r.indexes).join() === mix.map((_, i) => i).join() &&
    foc.flatMap((r) => r.indexes).join() === mix.map((_, i) => i).join(),
);
check("every photograph is placed exactly once", std.flatMap((r) => r.indexes).length === 25);

const stdPortrait = plate(std.find((r) => r.indexes.some((i) => mix[i] === "P")), "P");
check(
  "standard prints a portrait plate far larger than the old grid did",
  stdPortrait.width * stdPortrait.height > beforePortrait.width * beforePortrait.height * 2,
  `${stdPortrait.width}x${stdPortrait.height} vs ${beforePortrait.width}x${beforePortrait.height}`,
);
check("and still fits two to a row", std[0].cellWidth === "50%" && std[0].columnWidth === columnWidthFor(2));
check(
  "two rows of them still share a page, so the report does not double in length",
  2 * (stdPortrait.height + PLATE_CHROME_HEIGHT) <= USABLE_PAGE_HEIGHT,
);

check(
  "photo focus gives every photograph the width of the page",
  foc.every((r) => r.indexes.length === 1 && r.columnWidth === columnWidthFor(1) && r.centred),
);
const focPortrait = plate(foc[0], "P");
const focLandscape = plate(foc.find((r) => mix[r.indexes[0]] === "L"), "L");
check(
  "a tall photograph takes the page in photo focus",
  focPortrait.height > 500 && (focPortrait.height + PLATE_CHROME_HEIGHT) * 2 > USABLE_PAGE_HEIGHT,
  `${focPortrait.width}x${focPortrait.height}`,
);
check(
  "a wide one shares it with exactly one other",
  (focLandscape.height + PLATE_CHROME_HEIGHT) * 2 <= USABLE_PAGE_HEIGHT,
  `${focLandscape.width}x${focLandscape.height}`,
);
check(
  "so photo focus is one or two large plates a page, never three",
  (focLandscape.height + PLATE_CHROME_HEIGHT) * 3 > USABLE_PAGE_HEIGHT,
);

// One, two, three and four: a photograph with the row to itself is centred at
// the same size rather than stranded against the left margin with a hole
// beside it. Standard never widens a plate to the full page - that is what
// kept a one-photograph Daily and a one-plate Progress Report to one page.
const cells = (kinds) => planPhotoRows(shapes(kinds), "standard").map((r) => `${r.indexes.length}${r.centred ? "c" : ""}`).join();
check("a single photograph is centred rather than left stranded", cells(["P"]) === "1c");
check("two sit side by side", cells(["P", "P"]) === "2" && cells(["L", "L"]) === "2");
check("three are a pair and a centred third, not a pair and a gap", cells(["P", "P", "P"]) === "2,1c");
check("four are two rows of two", cells(["P", "P", "P", "P"]) === "2,2");
check("and five carry on the same way", cells(["P", "P", "P", "P", "P"]) === "2,2,1c");
check(
  "a centred plate is the same size as a paired one, so it costs no page",
  planPhotoRows(shapes(["P"]), "standard")[0].columnWidth === columnWidthFor(2) &&
    planPhotoRows(shapes(["P"]), "standard")[0].bounds.max ===
      planPhotoRows(shapes(["P", "P"]), "standard")[0].bounds.max,
);
check(
  "standard never widens a plate to the full page",
  planPhotoRows(shapes(["P", "L", "P", "L", "P"]), "standard").every(
    (r) => r.columnWidth === columnWidthFor(2),
  ),
);

check(
  "nothing is cropped: a plate keeps the photograph's own ratio",
  Math.abs(stdPortrait.width / stdPortrait.height - P.width / P.height) < 0.02 &&
    Math.abs(focLandscape.width / focLandscape.height - L.width / L.height) < 0.02,
);
check(
  "the style's floor is passed through untouched, so a panorama is not stretched further",
  planPhotoRows(shapes(["P", "P"]), "standard", 130)[0].bounds.min === 130,
);

console.log("\n10b. Rendered, on a 25-photo Daily");
const swindon = (photoLayout) =>
  daily({
    photoLayout,
    photos: mix.map((kind, i) => photo(`p${i}`, `Bay ${i + 1} - gully surround reinstated`, "during", kind === "L" ? LANDSCAPE : PORTRAIT)),
  });
const stdPages = await pages(createElement(ReportDocument, { data: swindon("standard") }));
const defaultPages = await pages(createElement(ReportDocument, { data: swindon(undefined) }));
const focusPages = await pages(createElement(ReportDocument, { data: swindon("focus") }));
console.log(`     standard ${stdPages} pages, focus ${focusPages} pages`);
check("an absent layout renders exactly as standard does", defaultPages === stdPages);
check("bigger plates do not run the report away with itself", stdPages <= 9, `${stdPages} pages`);
check("photo focus is the longer document, as asked for", focusPages > stdPages);
check(
  "a 25-photo Daily still renders in both",
  stdPages >= 1 && focusPages >= 1,
);

// Two full-width plates must share a page. The cap is derived from
// USABLE_PAGE_HEIGHT, so this is the check that the figure is still right
// against the renderer rather than against arithmetic.
const wide = (h) => png(4980, Math.round(4980 / (498 / h)));
const eight = (h) =>
  daily({ photoLayout: "focus", sections: [], photos: Array.from({ length: 8 }, (_, i) => photo(`p${i}`, null, null, wide(h))) });
const atCap = await pages(createElement(ReportDocument, { data: eight(columnWidthFor(1) / 1.6) }));
check(
  "eight full-width plates pair up rather than taking a page each",
  atCap <= 6,
  `${atCap} pages for 8 plates`,
);

console.log("\n10c. The same system prints the consolidated reports");
const summaryStd = await pages(
  createElement(SummaryReportDocument, { data: summary("completion", { photos: PHOTOS }) }),
);
const summaryFocus = await pages(
  createElement(SummaryReportDocument, { data: summary("completion", { photos: PHOTOS, photoLayout: "focus" }) }),
);
check("a Completion Report takes the same layouts", summaryStd >= 1 && summaryFocus >= 1);
check("and photo focus gives its plates more room there too", summaryFocus >= summaryStd);
const finaliseDaily = read("../app/(app)/reports/finalise-actions.ts");
const finaliseSummary = read("../app/(app)/summary-reports/finalise-actions.ts");
check(
  "both finalise actions bake the chosen layout into the issued file",
  /photoLayout: photoLayoutOf\(String\(formData\.get\("photoLayout"\)/.test(finaliseDaily) &&
    /photoLayout: photoLayoutOf\(String\(formData\.get\("photoLayout"\)/.test(finaliseSummary),
);
check(
  "and the preview is rendered from the same choice, so it is what gets issued",
  /photoLayout: photoLayoutOf\(search\.get\("layout"\)\)/.test(read("../app/(app)/reports/[id]/preview/route.ts")) &&
    /photoLayout: photoLayoutOf\(search\.get\("layout"\)\)/.test(read("../app/(app)/summary-reports/[id]/preview/route.ts")),
);
check(
  "the choice is carried, never stored - no column, no migration",
  !/photo_layout/.test(finaliseDaily) && !/photo_layout/.test(finaliseSummary),
);
const picker = read("../components/pdf/pdf-presentation.tsx");
check(
  "the picker offers the two and nothing else to set",
  /PHOTO_LAYOUTS\.map/.test(picker) && !/drag|resize|columns=|gridSize/i.test(picker),
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PDF EXPORT CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
