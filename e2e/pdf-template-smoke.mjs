/**
 * The issued document: what it says, and how it sits on the page.
 *
 * Run with the TSX loader:
 *   npm run test:pdf-template
 *
 * Three kinds of check, because no one of them is enough on its own.
 *
 * The tree checks read the real components with real props and assert what
 * reaches the page - the plate references, the captions, the badges, the
 * register note - because the rendered PDF subsets its fonts and cannot be
 * searched for words.
 *
 * The render checks put actual A4 pages through @react-pdf/renderer and count
 * them with pdf-lib, which is the only way to know a short report has not
 * quietly grown a blank page.
 *
 * The merge check proves the appendices still attach, since that is the part
 * of the pipeline a template change could break without anybody noticing.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";

import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

import { LANDSCAPE, PORTRAIT, SQUARE, png } from "./support/fixture-image.mjs";
import { nodesOf, sectionHeadings, textJoined } from "./support/pdf-tree.mjs";

import { imageSize, isPortrait, photoBoxHeight, photoBoxSize } from "../lib/pdf/image-size.ts";
import {
  photoEvidence,
  photoEvidenceHeading,
  photoReference,
} from "../lib/pdf/photo-evidence.ts";
import { ReportDocument } from "../lib/pdf/report-document.tsx";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";
import { PHOTO_COLUMN_WIDTH } from "../lib/pdf/components.tsx";
import { mergeReportWithDocuments } from "../lib/pdf/merge.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const photo = (id, caption, category, data) => ({ id, caption, category, data });

const ISSUE = {
  id: "issue-1",
  title: "Cable run obstructed at grid line 4",
  description: "Existing containment fouls the new duct route.",
  responsible: "M&E subcontractor",
  priority: "high",
  priorityLabel: "High",
  statusLabel: "Closed",
};

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
    plant: [{ description: "13t tracked excavator", quantity: 1 }],
    // Real stored section types, not invented ones: the layout groups sections
    // by type now, so a fixture using a type the app never stores would land
    // in the fallback group and prove nothing about the real document.
    sections: [
      { type: "executive_summary", label: "Summary", content: "A steady day on the east elevation." },
      { type: "works_completed", label: "Works completed", content: "Ducting laid to the east elevation." },
      { type: "issues_constraints", label: "Issues and constraints", content: "Access restricted after 3pm." },
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
    sections:
      kind === "completion"
        ? [
            { type: "project_overview", label: "Project overview", content: "The works remain on programme." },
            { type: "completed_works", label: "Completed works", content: "Ducting complete to the east elevation." },
            { type: "sign_off", label: "Sign-off", content: "No acceptance is recorded." },
          ]
        : [
            { type: "period_summary", label: "Period summary", content: "The works remain on programme." },
            { type: "key_activities", label: "Key activities", content: "Ducting complete to the east elevation." },
            { type: "next_period", label: "Next period", content: "Second fix is programmed to begin." },
          ],
    issues: [],
    photos: [],
    sourceLabels: ["Daily Report 008 · 28 August 2026"],
    supportingDocuments: [],
    documentsAppended: false,
    store: null,
    ...overrides,
  };
}

const REGISTER_ROWS = [
  {
    title: "GA Plan - Ground Floor",
    typeLabel: "Drawing",
    reference: "EI-1470-GA-001",
    revision: "C",
    documentDate: "12 August 2026",
  },
  { title: "Hoarding RAMS", typeLabel: "RAMS", reference: null, revision: null, documentDate: null },
];

const pages = async (element) =>
  (await PDFDocument.load(await renderToBuffer(element))).getPageCount();

const dailyPages = (data) => pages(createElement(ReportDocument, { data }));
const summaryPages = (data) => pages(createElement(SummaryReportDocument, { data }));

// ---------------------------------------------------------------------------

console.log("\n1. Plate references are deterministic and derived from order");
check("the first photograph is P01", photoReference(0) === "P01");
check("the ninth is P09", photoReference(8) === "P09");
check("the tenth is P10", photoReference(9) === "P10");
check("it keeps counting past ninety-nine", photoReference(99) === "P100");
check(
  "the same index always gives the same reference",
  [0, 5, 42].every((i) => photoReference(i) === photoReference(i)),
);
check(
  "the heading pairs the reference with the status",
  photoEvidenceHeading(photoEvidence({ caption: "x", status: "Before" }, 2)) === "P03 · BEFORE",
);
check(
  "and drops the separator when there is no status",
  photoEvidenceHeading(photoEvidence({ caption: "x", status: null }, 0)) === "P01",
);
check(
  "a blank caption is null rather than empty text",
  photoEvidence({ caption: "   ", status: null }, 0).caption === null,
);

console.log("\n2. A photograph is measured from its own bytes");
check("landscape is read", imageSize(LANDSCAPE)?.width === 1600);
check("portrait is read", imageSize(PORTRAIT)?.height === 1620);
check("square is read", imageSize(SQUARE)?.width === 1200);
check("portrait is recognised", isPortrait(imageSize(PORTRAIT)) && !isPortrait(imageSize(LANDSCAPE)));
// SOI, then an SOF0 frame carrying 900 high by 1600 wide.
const jpegHeader = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x06, 0x40, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
]);
check("a JPEG frame header is read too", imageSize(jpegHeader)?.width === 1600, JSON.stringify(imageSize(jpegHeader)));
check("unreadable bytes answer null rather than throwing", imageSize(Buffer.alloc(40)) === null);
check("so does nothing at all", imageSize(null) === null);

console.log("\n3. A tall photograph gets a tall box, within limits");
const landscapeBox = photoBoxHeight(imageSize(LANDSCAPE), PHOTO_COLUMN_WIDTH);
const portraitBox = photoBoxHeight(imageSize(PORTRAIT), PHOTO_COLUMN_WIDTH);
check("a portrait plate is taller than a landscape one", portraitBox > landscapeBox, `${portraitBox} vs ${landscapeBox}`);
check("a landscape plate keeps its own shape", Math.abs(landscapeBox - PHOTO_COLUMN_WIDTH / (1600 / 1067)) <= 1);
check("a portrait plate is capped rather than owning the page", portraitBox <= 205, String(portraitBox));
const panorama = photoBoxHeight(imageSize(png(3000, 600)), PHOTO_COLUMN_WIDTH);
check("a panorama does not become a letterbox strip", panorama >= 100 && panorama < landscapeBox, String(panorama));
check("an unknown format still gets a sensible box", photoBoxHeight(null, PHOTO_COLUMN_WIDTH) > 0);
check(
  "the height is deterministic",
  photoBoxHeight(imageSize(PORTRAIT), PHOTO_COLUMN_WIDTH) === portraitBox,
);
// Nothing is cropped and nothing is stretched: the plate is drawn at the
// photograph's own ratio, and the frame is drawn around the plate.
for (const [name, bytes, ratio] of [
  ["landscape", LANDSCAPE, 1600 / 1067],
  ["portrait", PORTRAIT, 1080 / 1620],
  ["square", SQUARE, 1],
]) {
  const box = photoBoxSize(imageSize(bytes), PHOTO_COLUMN_WIDTH);
  check(
    `a ${name} plate keeps its aspect ratio`,
    Math.abs(box.width / box.height - ratio) < 0.02,
    `${box.width}x${box.height}`,
  );
  check(`a ${name} plate stays inside its column`, box.width <= PHOTO_COLUMN_WIDTH);
}

console.log("\n4. The daily report says what it should");
const dailyTree = createElement(ReportDocument, {
  data: daily({
    issues: [ISSUE],
    supportingDocuments: REGISTER_ROWS,
    documentsAppended: true,
    photos: [
      photo("a", "Existing western boundary hoarding prior to dismantling.", "before", LANDSCAPE),
      photo("b", null, "progress", PORTRAIT),
      photo("c", "Completed duct run.", "general", SQUARE),
    ],
  }),
});
const dailyText = textJoined(dailyTree);
for (const [what, needle] of [
  ["the product identity", "SiteBoss Pro"],
  ["the company whose report it is", "Empire Interiors Ltd"],
  ["the document type", "Site Daily Report"],
  ["the number", "009"],
  ["the project", "South Croydon"],
  ["the client", "Riverside Developments Ltd"],
  ["the project reference", "1470"],
  ["a written section", "Ducting laid to the east elevation."],
  ["the workforce table", "Groundworks Ltd"],
  ["the plant table", "13t tracked excavator"],
  ["the issue", "Cable run obstructed at grid line 4"],
  ["the register", "GA Plan - Ground Floor"],
  ["the first plate", "P01"],
  ["the second plate", "P02"],
  ["the third plate", "P03"],
  ["a caption", "Existing western boundary hoarding prior to dismantling."],
]) {
  check(`it prints ${what}`, dailyText.includes(needle), needle);
}
// Three headings, and no more. A client wants what happened, what it looked
// like and what is still open - the thirteen headings this used to print were
// a database table with a cover sheet on it. Every stored section is still in
// there, opening its own paragraph with its own name.
for (const heading of ["Daily Summary", "Photos & Evidence", "Issues / Next Steps"]) {
  check(`the daily report shows "${heading}"`, dailyText.includes(heading), heading);
}
for (const gone of ["Photographic evidence", "Works in progress", "Deliveries and plant"]) {
  check(`"${gone}" is no longer a heading of its own`, !sectionHeadings(dailyTree).includes(gone), gone);
}
check(
  "a stored section keeps its name as a run-in label",
  dailyText.includes("Works completed."),
);
check("the section says which plates it holds", dailyText.includes("P01-P03"));
check("a status that says something is printed", dailyText.includes("Before"));
check("a status that says nothing is not", !dailyText.includes("Other"));
check("nothing is invented for a photograph with no caption", !dailyText.includes("undefined"));
check(
  "the register explains where the documents are",
  dailyText.includes("follow this report as appendices"),
);

// Nothing was dropped to reach three sections. The recorded data moved to an
// appendix, which is where a reader looks for it rather than where it
// interrupts the report.
check("the appendix is printed", dailyText.includes("Appendix - record data"));
check("and says what is in it on its own line", dailyText.includes("Workforce · Plant · Documents"));
check("and it carries the workforce", dailyText.includes("Workforce on site"));
check("and the plant", dailyText.includes("Plant and equipment"));
check("and the document register", dailyText.includes("Supporting documents"));
check(
  "the appendix comes after the three sections, not among them",
  dailyText.indexOf("Appendix - record data") > dailyText.indexOf("Issues / Next Steps"),
);
check("the issue carries its priority and status as badges", dailyText.includes("HIGH") && dailyText.includes("CLOSED"));
check("the responsible party is labelled", dailyText.includes("Responsible") && dailyText.includes("M&E subcontractor"));
check("no resolution label appears where there is no resolution", !dailyText.includes("Resolution"));

console.log("\n5. A linked store reaches the report, and an unlinked one prints nothing");
// The store number and the project reference are different numbers, so the
// fixture gives them different values and the report must print both.
const withStore = textJoined(
  createElement(ReportDocument, {
    data: daily({
      store: { name: "South Croydon", code: "1470" },
      projectReference: "EI-2026-114",
    }),
  }),
);
check("the store is named", withStore.includes("South Croydon · 1470"));
check("under its own label", withStore.includes("Store"));
check(
  "the project reference is still the project's own",
  withStore.includes("EI-2026-114") && withStore.includes("Project reference"),
);
check(
  "a project with no store prints no store line",
  !textJoined(createElement(ReportDocument, { data: daily() })).includes("Store"),
);
for (const kind of ["progress", "completion"]) {
  const text = textJoined(
    createElement(SummaryReportDocument, {
      data: summary(kind, { store: { name: "South Croydon", code: "1470" } }),
    }),
  );
  check(`${kind}: names the store too`, text.includes("South Croydon · 1470"));
  check(
    `${kind}: and prints nothing without one`,
    !textJoined(createElement(SummaryReportDocument, { data: summary(kind) })).includes("Store"),
  );
}

console.log("\n6. Empty fields are dropped rather than labelled");
const bare = textJoined(
  createElement(ReportDocument, {
    data: daily({ client: null, weather: null, authorName: null, projectReference: null }),
  }),
);
check("no weather line", !bare.includes("Weather"));
check("no reported-by line", !bare.includes("Reported by"));
check("no project reference line", !bare.includes("Project reference"));
check("the report date survives", bare.includes("Report date"));
const notAppended = textJoined(
  createElement(ReportDocument, {
    data: daily({ supportingDocuments: REGISTER_ROWS, documentsAppended: false }),
  }),
);
check(
  "a register that is not appended says so instead",
  notAppended.includes("held on the project record") && !notAppended.includes("as appendices"),
);

console.log("\n7. The consolidated reports use the same system");
for (const kind of ["progress", "completion"]) {
  const tree = createElement(SummaryReportDocument, {
    data: summary(kind, {
      issues: [{ ...ISSUE, resolution: "Containment diverted and the duct re-routed." }],
      supportingDocuments: REGISTER_ROWS,
      documentsAppended: true,
      photos: [photo("a", "Second fix complete.", "after", LANDSCAPE)],
    }),
  });
  const text = textJoined(tree);
  check(`${kind}: names itself`, text.includes(kind === "completion" ? "Completion Report" : "Progress Report"));
  check(`${kind}: carries the same header`, text.includes("SiteBoss Pro") && text.includes("Empire Interiors Ltd"));
  check(
    `${kind}: uses the shared three-section structure`,
    text.includes("Photos & Evidence") &&
      text.includes(kind === "completion" ? "Outstanding / Follow-on" : "Outstanding / Next Actions"),
  );
  check(
    `${kind}: opens with its own overview heading`,
    text.includes(kind === "completion" ? "Completion Summary" : "Progress Overview"),
  );
  check(`${kind}: numbers its plates`, text.includes("P01"));
  check(`${kind}: prints the closing record`, text.includes("Containment diverted and the duct re-routed."));
  check(`${kind}: labels the resolution`, text.includes("Resolution"));
  check(`${kind}: keeps the source record`, text.includes("Daily Report 008 · 28 August 2026"));
  check(`${kind}: carries the revision`, text.includes("Revision"));
}

console.log("\n8. Every page is identifiable");
for (const [name, tree] of [
  ["daily", dailyTree],
  ["consolidated", createElement(SummaryReportDocument, { data: summary("progress") })],
]) {
  const nodes = nodesOf(tree);
  const numbering = nodes.filter((node) => typeof node.props?.render === "function");
  check(`${name}: the footer numbers the pages`, numbering.length === 1);
  check(
    `${name}: it says which of how many`,
    numbering[0]?.props.render({ pageNumber: 2, totalPages: 7 }) === "Page 2 of 7",
  );
  const fixed = nodes.filter((node) => node.props?.fixed === true);
  check(`${name}: the header and footer repeat on every page`, fixed.length === 2);
}

console.log("\n9. Nothing forces a page break, and only cards stay whole");
for (const [name, file] of [
  ["daily", "../lib/pdf/report-document.tsx"],
  ["consolidated", "../lib/pdf/summary-document.tsx"],
  ["shared parts", "../lib/pdf/components.tsx"],
]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  check(`${name}: nothing forces a page break`, !/<View break>|break=\{true\}|\bbreak\b\s*\/>/.test(source));
  check(`${name}: no whole section is pinned together`, !/<View key=\{section\.type\} wrap=\{false\}>/.test(source));
}
const parts = readFileSync(new URL("../lib/pdf/components.tsx", import.meta.url), "utf8");
check("an issue record is kept whole", /style=\{\[s\.issue[^\]]*\]\} wrap=\{false\}/.test(parts));
check("a photographic plate is kept whole", /style=\{s\.photoCell\} wrap=\{false\}/.test(parts));
check("a table row is kept whole", /style=\{s\.tableRow\} key=\{entry\.key\} wrap=\{false\}/.test(parts));
check(
  "a column header travels with its first row",
  /<View wrap=\{false\}>[\s\S]*?tableHeadRow[\s\S]*?rows\.length > 0 \? row\(rows\[0\]\) : null/.test(parts),
);
check(
  "a photographic row is kept whole",
  /style=\{s\.photoRow\} wrap=\{false\}/.test(parts),
);
const theme = readFileSync(new URL("../lib/pdf/theme.ts", import.meta.url), "utf8");
check(
  "the plates are laid out in explicit rows rather than a wrapping grid",
  /photoRow:/.test(theme) && !/photoGrid:/.test(theme),
);
// react-pdf drops an absolutely positioned `fixed` element the moment a line
// height reaches it, and a page style is inherited. That is why no issued
// SiteBoss PDF carried a running footer until this batch.
const pageStyle = theme.slice(theme.indexOf("    page: {"), theme.indexOf("    // ---- running header"));
check(
  "no line height is set on the page, where it would hide the footer",
  !/^\s*lineHeight:/m.test(pageStyle),
);
// react-pdf resolves a line height against the element's own font size and
// falls back to its default of 18 rather than to the inherited one, so a
// style that sets one without the other prints at two and a half times the
// leading it asked for.
check(
  "every style that sets a line height also sets its own font size",
  theme
    .split("\n")
    .filter((line) => /^\s*[a-zA-Z]/.test(line) && line.includes("lineHeight:"))
    .every((line) => line.includes("fontSize:")),
);
check("headings reserve room below them", /minPresenceAhead=\{reserve\}/.test(parts));

console.log("\n10. Real renders: page counts");
const counts = {};
counts.dailyBare = await dailyPages(daily());
counts.dailyOnePhoto = await dailyPages(daily({ photos: [photo("a", "One.", "before", LANDSCAPE)] }));
counts.dailyIssuesOnly = await dailyPages(
  daily({ issues: [ISSUE, { ...ISSUE, id: "i2" }, { ...ISSUE, id: "i3" }] }),
);
counts.dailyMixed = await dailyPages(
  daily({
    issues: [ISSUE, { ...ISSUE, id: "i2" }, { ...ISSUE, id: "i3" }],
    supportingDocuments: REGISTER_ROWS,
    documentsAppended: true,
    photos: [
      photo("a", "Existing hoarding.", "before", LANDSCAPE),
      photo("b", null, "progress", PORTRAIT),
      photo("c", "Duct run.", "after", SQUARE),
      photo("d", "Made good.", "after", LANDSCAPE),
    ],
  }),
);
counts.dailyManyPhotos = await dailyPages(
  daily({
    photos: Array.from({ length: 12 }, (_, i) =>
      photo(`p${i}`, `Plate ${i + 1}.`, i % 2 ? "before" : "after", i % 3 ? LANDSCAPE : PORTRAIT),
    ),
  }),
);
counts.progress = await summaryPages(
  summary("progress", {
    issues: [{ ...ISSUE, resolution: "Diverted." }],
    photos: [photo("a", "One.", "after", LANDSCAPE)],
  }),
);
counts.completion = await summaryPages(
  summary("completion", {
    issues: [{ ...ISSUE, resolution: "Diverted." }, { ...ISSUE, id: "i2", resolution: "Cleared." }],
    supportingDocuments: REGISTER_ROWS,
    documentsAppended: true,
    photos: Array.from({ length: 6 }, (_, i) =>
      photo(`p${i}`, `Plate ${i + 1}.`, "after", i % 2 ? PORTRAIT : LANDSCAPE),
    ),
  }),
);
for (const [name, count] of Object.entries(counts)) console.log(`     ${name}: ${count} page(s)`);

// Budgets rather than exact numbers: the point is that a report cannot
// silently double in length, not that a fixture always lands on the same page.
// Each of these was measured against the previous template and is equal to it
// or better - see the batch notes in HANDOFF.md.
check("a daily report with nothing attached is one page", counts.dailyBare === 1);
check("one photograph does not cost a second page", counts.dailyOnePhoto === 1, String(counts.dailyOnePhoto));
check("three issues do not own a page each", counts.dailyIssuesOnly === 1, String(counts.dailyIssuesOnly));
check("a full daily report stays short", counts.dailyMixed <= 2, String(counts.dailyMixed));
check("twelve photographs stay within a daily report's budget", counts.dailyManyPhotos <= 3, String(counts.dailyManyPhotos));
check("a progress report with one plate is one page", counts.progress === 1, String(counts.progress));
check("a completion report with six plates stays compact", counts.completion <= 3, String(counts.completion));

console.log("\n11. Appendices still attach, and the report is still first");
const supporting = await PDFDocument.create();
supporting.addPage();
supporting.addPage();
const supportingBytes = Buffer.from(await supporting.save());
const reportBytes = await renderToBuffer(
  createElement(ReportDocument, {
    data: daily({ supportingDocuments: REGISTER_ROWS, documentsAppended: true }),
  }),
);
const reportPages = (await PDFDocument.load(reportBytes)).getPageCount();
const merged = await mergeReportWithDocuments(reportBytes, [
  { title: "GA Plan - Ground Floor", bytes: supportingBytes },
]);
check("the merge succeeds", merged.ok, merged.ok ? "" : merged.error);
if (merged.ok) {
  const total = (await PDFDocument.load(merged.pdf)).getPageCount();
  check("every page arrives", total === reportPages + 2, `${total} vs ${reportPages} + 2`);
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PDF TEMPLATE CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
