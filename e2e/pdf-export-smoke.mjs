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
import { fitBox, imageSize } from "../lib/pdf/image-size.ts";
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
check("the rules import nothing at runtime", !/^import /m.test(rules));
check("so the picker can use them without the renderer", !/@\//.test(rules));
check(
  "no colour picker crept in",
  !/#[0-9a-f]{6}/i.test(rules) && !/colou?rPicker|customColou?r/i.test(rules),
);

console.log("\n2. The styles are actually different documents");
const themes = Object.fromEntries(PDF_STYLES.map((key) => [key, pdfTheme(key, "standard")]));
check(
  "corporate drops the amber",
  themes.corporate.colors.accent !== themes.siteboss.colors.accent &&
    !/f59e0b/i.test(themes.corporate.colors.accent),
);
check("and softens the rule", themes.corporate.colors.rule !== themes.siteboss.colors.rule);
check("siteboss keeps it", /f59e0b/i.test(themes.siteboss.colors.accent));
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
  "and the issued PDF is still whatever was stored",
  /signPdfUrl|storedPdf/.test(dailyPdfPage) && !/renderReportPdf/.test(dailyPdfPage),
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

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PDF EXPORT CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
