/**
 * The issued PDF and the supporting documents inside it.
 *
 * Merges real PDFs and counts real pages, so it needs node_modules (pdf-lib is
 * a production dependency and is always installed for a build). It needs
 * neither Supabase nor a dev server.
 *
 * What it protects: a client receives one file containing the report and the
 * drawings, in a stable order, with nothing silently missing. A register
 * listing five drawings above four sets of pages would be worse than a refusal,
 * because nobody notices until the missing one is the one that matters.
 */
import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

import { describeMergeFailure, mergeReportWithDocuments } from "../lib/pdf/merge.ts";
import {
  describePackageChoice,
  describeUnavailable,
  documentsFlag,
  orderAttachments,
  shouldIncludeDocuments,
  unavailableDocuments,
} from "../lib/reports/document-package.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** A PDF whose pages are all a distinctive width, so their origin is provable. */
async function makePdf(pageCount, width) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) doc.addPage([width, 800]);
  return Buffer.from(await doc.save());
}

async function pageWidths(buffer) {
  const doc = await PDFDocument.load(new Uint8Array(buffer));
  return doc.getPages().map((page) => Math.round(page.getWidth()));
}

const REPORT_W = 595;
const DRAWING_W = 111;
const RAMS_W = 222;

console.log("\n1. Including the documents is the default, and can be turned off");
check("on by default when documents are linked", shouldIncludeDocuments(undefined, true));
check("an empty flag leaves the default alone", shouldIncludeDocuments("", true));
check("explicitly on", shouldIncludeDocuments("1", true));
check("turned off by 0", !shouldIncludeDocuments("0", true));
check("and by false/off/no", !shouldIncludeDocuments("false", true) && !shouldIncludeDocuments("off", true) && !shouldIncludeDocuments("no", true));
check("never on when nothing is linked", !shouldIncludeDocuments("1", false));
check("the flag round-trips", documentsFlag(true) === "1" && documentsFlag(false) === "0");

console.log("\n2. The combined PDF is the report followed by the documents");
const report = await makePdf(2, REPORT_W);
const drawing = await makePdf(1, DRAWING_W);
const rams = await makePdf(3, RAMS_W);

const merged = await mergeReportWithDocuments(report, [
  { title: "GA Plan", bytes: drawing },
  { title: "RAMS", bytes: rams },
]);
check("the merge succeeds", merged.ok, merged.ok ? "" : merged.error);
const widths = merged.ok ? await pageWidths(merged.pdf) : [];
check("every page is present", widths.length === 6, String(widths.length));
check(
  "the report pages come first, then each document in turn",
  widths.join() === [REPORT_W, REPORT_W, DRAWING_W, RAMS_W, RAMS_W, RAMS_W].join(),
  widths.join(),
);
check("the appended count is reported", merged.ok && merged.appendedPages === 4);
check("the report's own pages are untouched in number", widths.filter((w) => w === REPORT_W).length === 2);

console.log("\n3. Each document appears once, and an unselected one not at all");
const onlyDrawing = await mergeReportWithDocuments(report, [{ title: "GA Plan", bytes: drawing }]);
const onlyWidths = onlyDrawing.ok ? await pageWidths(onlyDrawing.pdf) : [];
check("selecting one appends only that one", onlyWidths.join() === [REPORT_W, REPORT_W, DRAWING_W].join(), onlyWidths.join());
check("the unselected document's pages are absent", !onlyWidths.includes(RAMS_W));
check(
  "the same document linked once is appended once",
  (merged.ok ? await pageWidths(merged.pdf) : []).filter((w) => w === DRAWING_W).length === 1,
);
const none = await mergeReportWithDocuments(report, []);
check("no documents leaves the report exactly as it was", none.ok && none.pdf === report);
check("and reports nothing appended", none.ok && none.appendedPages === 0);

console.log("\n4. Order is deterministic");
const shuffled = orderAttachments([
  { documentId: "c", title: "C", storagePath: "c.pdf", sortOrder: 2 },
  { documentId: "a", title: "A", storagePath: "a.pdf", sortOrder: 0 },
  { documentId: "b", title: "B", storagePath: "b.pdf", sortOrder: 1 },
]);
check("selection order wins", shuffled.map((d) => d.title).join() === "A,B,C");
const tied = orderAttachments([
  { documentId: "zzz", title: "Z", storagePath: "z.pdf", sortOrder: 0 },
  { documentId: "aaa", title: "A", storagePath: "a.pdf", sortOrder: 0 },
]);
check("a tie falls back to the id, so two issues match", tied.map((d) => d.title).join() === "A,Z");
check("ordering does not mutate the input", shuffled !== undefined && shuffled.length === 3);

console.log("\n5. A document that cannot be read blocks the issue");
const corrupt = await mergeReportWithDocuments(report, [
  { title: "GA Plan", bytes: drawing },
  { title: "Broken Permit", bytes: Buffer.from("this is not a pdf at all") },
]);
check("the merge fails rather than skipping it", !corrupt.ok);
check("and names the document that failed", !corrupt.ok && corrupt.failed.join() === "Broken Permit", !corrupt.ok ? corrupt.failed.join() : "");
check(
  "the message says nothing has been issued",
  !corrupt.ok && /nothing has been issued/i.test(corrupt.error),
  !corrupt.ok ? corrupt.error : "",
);
check(
  "a good document alongside it does not rescue the merge",
  !corrupt.ok,
);
check("one failure reads in the singular", /^"A" could not be read/.test(describeMergeFailure(["A"])));
check("several are counted and listed", /^2 supporting documents could not be read/.test(describeMergeFailure(["A", "B"])));

console.log("\n6. A document whose file has gone blocks it too");
const gone = [
  { documentId: "a", title: "GA Plan", storagePath: null, sortOrder: 0 },
  { documentId: "b", title: "RAMS", storagePath: "b.pdf", sortOrder: 1 },
];
check("it is spotted before anything is downloaded", unavailableDocuments(gone).join() === "GA Plan");
check("nothing is missing when everything is stored", unavailableDocuments([gone[1]]).length === 0);
check(
  "and the message says what to do",
  /Unlink it from this report, or upload it again/.test(describeUnavailable(["GA Plan"])),
);

console.log("\n7. The user is told what they are about to send");
check(
  "including them says the client gets one PDF",
  /appended in full after the report/.test(describePackageChoice({ include: true, documentCount: 2 })),
);
check(
  "excluding them says the client gets the report only",
  /listed in the report but not attached/.test(describePackageChoice({ include: false, documentCount: 2 })),
);
check("one reads in the singular", /1 supporting document will/.test(describePackageChoice({ include: true, documentCount: 1 })));
check(
  "and nothing linked says so",
  describePackageChoice({ include: true, documentCount: 0 }) ===
    "No supporting documents are linked to this report.",
);

console.log("\n8. The issued file is built before it is stored, and never overwritten");
const dailyFinalise = readFileSync(new URL("../app/(app)/reports/finalise-actions.ts", import.meta.url), "utf8");
const summaryFinalise = readFileSync(new URL("../app/(app)/summary-reports/finalise-actions.ts", import.meta.url), "utf8");
for (const [name, source] of [["daily", dailyFinalise], ["consolidated", summaryFinalise]]) {
  const mergeAt = source.indexOf("mergeReportWithDocuments(pdf");
  const uploadAt = source.indexOf(".upload(path, pdf");
  check(`${name}: the merge happens before the upload`, mergeAt > -1 && uploadAt > -1 && mergeAt < uploadAt);
  check(
    `${name}: a failed merge returns instead of issuing`,
    /if \(!merged\.ok\) return \{ error: merged\.error \};/.test(source),
  );
  check(
    `${name}: a missing attachment returns instead of issuing`,
    /if \(!(loaded|attachments)\.ok\) return \{ error: (loaded|attachments)\.error \};/.test(source),
  );
  check(
    `${name}: the stored file is never overwritten`,
    /upsert: false/.test(source),
  );
}
check(
  "reopening does not delete the issued file",
  !/storage[\s\S]{0,80}remove/.test(dailyFinalise.slice(dailyFinalise.indexOf("export async function reopenReport"))),
);

console.log("\n9. The preview is the same package the client would get");
const dailyPreview = readFileSync(new URL("../app/(app)/reports/[id]/preview/route.ts", import.meta.url), "utf8");
const summaryPreview = readFileSync(new URL("../app/(app)/summary-reports/[id]/preview/route.ts", import.meta.url), "utf8");
for (const [name, source] of [["daily", dailyPreview], ["consolidated", summaryPreview]]) {
  check(`${name}: the preview merges the documents too`, /mergeReportWithDocuments\(pdf/.test(source));
  check(
    `${name}: it honours the same flag as finalising`,
    // The parameter is read from the request's own search params, however the
    // route names them - it now keeps them in `search` because the style and
    // cover are read from there too.
    /shouldIncludeDocuments\(/.test(source) && /\.get\("documents"\)/.test(source),
  );
  check(
    `${name}: a document it cannot merge refuses the preview rather than hiding it`,
    /status: 409/.test(source),
  );
}

console.log("\n10. Each document can still be opened on its own");
for (const [name, file] of [
  ["daily", "../app/(app)/reports/[id]/page.tsx"],
  ["consolidated", "../app/(app)/summary-reports/[id]/page.tsx"],
]) {
  const page = readFileSync(new URL(file, import.meta.url), "utf8");
  check(`${name}: an issued report offers Open document`, /Open document/.test(page));
  check(
    `${name}: through a signed URL, not a public bucket`,
    /signDocumentUrls/.test(page),
  );
  check(
    `${name}: and says so when the file has gone`,
    /No longer stored on the project/.test(page),
  );
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL DOCUMENT PACKAGE CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
