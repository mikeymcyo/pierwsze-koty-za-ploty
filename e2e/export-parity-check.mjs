/**
 * Three real PDFs, and what is in them.
 *
 * The assertions elsewhere prove the screen and the document group prose the
 * same way. This renders one Daily, one Progress and one Completion through
 * the shipping layouts, pulls the text back out of the actual PDF bytes, and
 * prints what a client would read - so "what I see equals what I get" can be
 * checked by a person rather than inferred from a regex.
 *
 * Each fixture deliberately carries a retained legacy section that no group
 * declares. It must not appear in any of the three.
 *
 *   npm run check:export-parity
 */

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import { ReportDocument } from "../lib/pdf/report-document.tsx";
import { SummaryReportDocument } from "../lib/pdf/summary-document.tsx";
import { reportStructure } from "../lib/report-structure.ts";
import { serialiseInstructedWorks } from "../lib/summary-reports/instructed-works.ts";

class M { constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; } }
globalThis.DOMMatrix ??= M;
globalThis.ImageData ??= class {};
globalThis.Path2D ??= class {};

async function textOf(element) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await renderToBuffer(element));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const item of content.items) if ("str" in item) out += item.str + (item.hasEOL ? "\n" : " ");
  }
  return { text: out, pages: doc.numPages };
}

const LEGACY = "RETAINED LEGACY TEXT NOBODY SAW";
const failures = [];
const check = (label, ok, detail = "") => {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
};

const base = {
  companyName: "Empire Interiors Ltd",
  projectName: "RDC Northfleet",
  client: "Lidl GB",
  siteAddress: "Crete Hall Road, Northfleet",
  projectReference: "GB0750",
  issues: [],
  photos: [],
  supportingDocuments: [],
  documentsAppended: false,
  store: null,
};

const daily = {
  ...base,
  reportNumber: "009",
  reportDate: "1 September 2026",
  weather: "Dry, 18C",
  authorName: "M. Korzeniak",
  finalisedAt: "1 September 2026",
  workforce: [{ company_name: "Groundworks Ltd", trade: "Groundworks", operatives: 6 }],
  plant: [{ description: "13t tracked excavator", quantity: 1 }],
  sections: [
    { type: "executive_summary", label: "Summary", content: "Bay 39 chamber rebuilt and reinstated in QC6." },
    { type: "works_completed", label: "Works completed", content: LEGACY },
  ],
};

const summaryBase = {
  ...base,
  title: null,
  revision: 0,
  issuedAt: "1 September 2026",
  issuedBy: "M. Korzeniak",
  sourceLabels: ["Daily Report 009 · 1 September 2026"],
};

/** One defect that matches an instructed item, one that plainly does not. */
const ISSUES = [
  {
    id: "in",
    title: "Bay 39 chamber surround still settling",
    description: null,
    responsible: "Empire Interiors",
    priority: "medium",
    priorityLabel: "Medium",
    statusLabel: "Open",
    resolution: null,
  },
  {
    id: "out",
    title: "Signage bracket corroded at the entrance canopy",
    description: null,
    responsible: null,
    priority: "low",
    priorityLabel: "Low",
    statusLabel: "Open",
    resolution: null,
  },
];

const progress = {
  ...summaryBase,
  kind: "progress",
  number: "002",
  periodLabel: "1 to 31 August 2026",
  sections: [
    { type: "period_summary", label: "Period summary", content: "Yard repairs progressed across six bays." },
    { type: "next_period", label: "Next period", content: "Chamber at bay 39 to be completed." },
    { type: "key_activities", label: "Key activities", content: LEGACY },
  ],
};

const completion = {
  ...summaryBase,
  kind: "completion",
  number: "001",
  periodLabel: "Whole project record",
  instruction: "Lidl External Walk, 21 July 2026",
  issues: ISSUES,
  sections: [
    { type: "project_overview", label: "Completion summary", content: "All eight instructed items complete." },
    {
      type: "instructed_works",
      label: "Instructed works and status",
      content: serialiseInstructedWorks(
        [
        {
          instruction: "Repair damaged concrete around drain",
          location: "Bay 39",
          worksCarriedOut: "Full chamber rebuild, reinstated in UltraCrete QC6.",
          plateRefs: [],
          status: "Complete",
        },
        {
          instruction: "Replace damaged tarmac",
          location: "Bay 37",
          worksCarriedOut: "",
          plateRefs: [],
          status: "Not confirmed",
        },
        {
          instruction: "Repair concrete around drain",
          location: "Bay 33",
          worksCarriedOut: "Localised break out and reinstatement around the gully.",
          plateRefs: [],
          status: "Complete",
        },
      ],
        [
          { material: "UltraCrete QC6", use: "Slab patches and chamber top 100 mm" },
          { material: "Class B engineering bricks", use: "Chamber wall rebuild" },
        ],
        [
          {
            heading: "Drainage chamber rebuild - Bay 39",
            body: "Dismantled to sound base, rebuilt in engineering bricks, C40 surround poured to 100 mm below finished level.",
            plateRefs: [],
          },
          {
            heading: "Slab patch repairs",
            body: "Broken out to sound material, edges squared, reinstated flush in QC6.",
            plateRefs: [],
          },
        ],
      ),
    },
    { type: "sign_off", label: "Outstanding and sign-off", content: "Nothing outstanding." },
    { type: "completed_works", label: "Completed works", content: LEGACY },
  ],
};

for (const [name, element, kind] of [
  ["DAILY", createElement(ReportDocument, { data: daily }), "daily"],
  ["PROGRESS", createElement(SummaryReportDocument, { data: progress }), "progress"],
  ["COMPLETION", createElement(SummaryReportDocument, { data: completion }), "completion"],
]) {
  const { text, pages } = await textOf(element);
  const flat = text.replace(/\s+/g, " ");

  console.log(`\n${"=".repeat(70)}\n${name} - ${pages} page(s), rendered from the shipping layout\n${"=".repeat(70)}`);
  console.log(text.trim());

  console.log(`\n-- ${name}: what the screen would show --`);
  const declared = reportStructure(kind).flatMap((group) => group.sections);
  console.log(`   headings: ${reportStructure(kind).map((g) => g.label).join(" / ")}`);
  console.log(`   sections: ${declared.join(", ") || "(none)"}`);

  check(`${name}: the retained legacy section is NOT in the PDF`, !flat.includes(LEGACY));
  check(
    `${name}: every declared section with content is in the PDF`,
    (kind === "daily"
      ? ["Bay 39 chamber rebuilt"]
      : kind === "progress"
        ? ["Yard repairs progressed", "Chamber at bay 39 to be completed"]
        : ["All eight instructed items complete", "Nothing outstanding"]
    ).every((needle) => flat.includes(needle)),
  );
  check(
    `${name}: the recorded data on the screen is in the PDF`,
    kind === "daily" ? flat.includes("Groundworks Ltd") && flat.includes("tracked excavator") : true,
  );
}

const completionText = (await textOf(createElement(SummaryReportDocument, { data: completion }))).text.replace(/\s+/g, " ");
check("COMPLETION: the instructed works table prints its rows", completionText.includes("Bay 39") && completionText.includes("Bay 37"));
check("COMPLETION: an unevidenced row reads Not confirmed", completionText.includes("Not confirmed"));
check(
  "COMPLETION: and says what that means",
  /not a statement that the work was not carried out/i.test(completionText),
);
check("COMPLETION: the cover names what instructed the works", /Lidl External Walk, 21 July 2026/.test(completionText));
check("COMPLETION: the materials table prints", /UltraCrete QC6/.test(completionText) && /engineering bricks/i.test(completionText));
check("COMPLETION: the workstreams print", /Drainage chamber rebuild/.test(completionText) && /rebuilt in engineering bricks/.test(completionText));
check(
  "COMPLETION: defects outside the instruction are separated",
  /outside the instructed scope/i.test(completionText) && /Signage bracket corroded/.test(completionText),
);
check(
  "COMPLETION: and the commercial position is stated once",
  /not been repaired under it\. A proposal will follow separately/i.test(completionText),
);
check(
  "COMPLETION: the client acknowledges receipt only",
  /Acknowledgement confirms receipt of this report only/i.test(completionText),
);

// The simple job: same layout, none of the Phase 2 extras forced onto it.
const simple = {
  ...completion,
  instruction: null,
  issues: [],
  sections: [
    { type: "project_overview", label: "Completion summary", content: "The bakery sink was renewed and tested." },
    {
      type: "instructed_works",
      label: "Instructed works and status",
      content: serialiseInstructedWorks(
        [
          {
            instruction: "Repair the leaking bakery sink",
            location: "Bakery",
            worksCarriedOut: "Trap and waste renewed, tested, no leaks.",
            plateRefs: [],
            status: "Complete",
          },
        ],
        [{ material: "Compression waste fittings", use: "Sink waste" }],
        [
          { heading: "Sink repair", body: "Trap renewed.", plateRefs: [] },
          { heading: "Testing", body: "Run and checked.", plateRefs: [] },
        ],
      ),
    },
  ],
};
const simpleText = (await textOf(createElement(SummaryReportDocument, { data: simple }))).text.replace(/\s+/g, " ");
console.log(`\n${"=".repeat(70)}\nCOMPLETION (SIMPLE JOB) - nothing forced onto it\n${"=".repeat(70)}`);
console.log(simpleText.trim());
check("SIMPLE: the table still prints", /bakery sink/i.test(simpleText));
check("SIMPLE: no materials table on a one-material job", !/Materials/.test(simpleText));
check("SIMPLE: no workstreams on a one-item job", !/How the works were carried out/.test(simpleText));
check("SIMPLE: no Instruction field when nothing instructed it", !/Instruction/.test(simpleText));
check("SIMPLE: no out-of-scope heading when there are no defects", !/outside the instructed scope/i.test(simpleText));
check("SIMPLE: the client acknowledgement is still there", /Acknowledgement confirms receipt/i.test(simpleText));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("EXPORT PARITY: what you see is what you get");
else { for (const f of failures) console.log(`FAILED: ${f}`); process.exitCode = 1; }
