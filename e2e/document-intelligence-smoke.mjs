/**
 * Brief first, purchase order later, read it, then write the day.
 *
 * The whole point of Document Intelligence, end to end and without a network:
 * a job described in a van at seven, a PO that turns up at half past two, a
 * real PDF, a real text layer, a model reply we control, and the prompt the
 * Daily writer is actually given at the end of it.
 *
 * What is proved here is not that the parser runs. It is that the parser
 * cannot lie: the model's fabricated line is dropped by the check, the quoted
 * work never becomes instructed work, and nothing that reaches the Daily
 * prompt says any of the scope happened.
 *
 *   npm run test:document-intelligence
 */

import { buildSamplePurchaseOrder } from "./support/sample-po.mjs";
import { extractPdfText, pagesForPrompt } from "../lib/documents/pdf-text.ts";
import { parseExtraction } from "../lib/documents/extraction-schema.ts";
import {
  DOCUMENT_CONTEXT_RULES,
  JOB_DOCUMENT_LABEL,
  documentContextBlock,
  jobContextBlock,
} from "../lib/ai/job-context.ts";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
} from "../lib/ai/extraction-prompt.ts";
import { appendBriefEntry, briefForPrompt, documentEntryText } from "../lib/projects/job-brief.ts";
import { buildPrompt } from "../lib/ai/prompt.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const SPOKEN =
  "Attending Store 1848 to repair a leaking bakery sink and rectify the warehouse doors. Access may be difficult due to deliveries.";
const PO_ID = "8c5de434-3eea-46c7-8a93-76723f3ce018";

console.log("\n1. Seven in the morning: a spoken brief, and no paperwork at all");

let description = appendBriefEntry(null, SPOKEN, "2026-09-01 07:12");
check("the job has scope with no document", briefForPrompt(description).includes("bakery sink"));
check(
  "and the AI block is the brief alone",
  jobContextBlock(briefForPrompt(description), []).includes("JOB BRIEF") &&
    !jobContextBlock(briefForPrompt(description), []).includes(JOB_DOCUMENT_LABEL),
);

console.log("\n2. Half past two: the purchase order arrives and is read");

const bytes = await buildSamplePurchaseOrder();
const text = await extractPdfText(bytes);
check("the PDF has a text layer", text.ok === true, text.ok ? "" : text.error);
check("both pages were read", text.ok && text.text.pages.length === 2);
check("and nothing was truncated", text.ok && text.text.truncated === false);

const pages = text.text.pages;
const promptText = pagesForPrompt(pages);
check("the model is told which page is which", /\[PAGE 1\][\s\S]*\[PAGE 2\]/.test(promptText));

const extractionPrompt = buildExtractionPrompt({
  title: "Lidl PO 4501234567",
  docTypeLabel: "Client instruction",
  projectName: "Store 1848",
  pages: promptText,
  truncated: false,
});
check("the prompt carries the document", extractionPrompt.includes("Repair the leaking bakery sink"));
check(
  "and says how it was filed is not what it is",
  /which may not be what it is/.test(extractionPrompt),
);
check("the system prompt forbids reporting work as done", /Never describe an item as completed/.test(EXTRACTION_SYSTEM_PROMPT));
check("and tells the model its quotes are checked", /checked against the document automatically/.test(EXTRACTION_SYSTEM_PROMPT));
check("the prompt is versioned", EXTRACTION_PROMPT_VERSION === "extract-v1");

console.log("\n3. The model replies - correctly, sloppily, and dishonestly at once");

// Exactly what a real reply looks like on a bad day: three true items, one
// quoted item the model is tempted to promote, one page number off by one, and
// one requirement invented from what a PO of this kind usually says.
const modelReply = {
  document_kind: "Purchase order",
  summary: "A purchase order from Lidl GB for repairs at Store 1848.",
  fields: [
    {
      key: "order_number",
      label: "Order number",
      value: "4501234567",
      page: 1,
      quote: "Order number: 4501234567",
    },
    {
      key: "site",
      label: "Site",
      value: "Store 1848, Bakery and Warehouse",
      // Wrong page: it is on page 1. Sloppy, not false.
      page: 2,
      quote: "Site: Store 1848, Bakery and Warehouse",
    },
  ],
  scope_items: [
    {
      text: "Repair the leaking bakery sink, including replacement of the trap and waste connection",
      commitment: "instructed",
      page: 2,
      quote: "Repair the leaking bakery sink, including replacement of the trap and waste connection.",
    },
    {
      text: "Rectify the warehouse doors so that both leaves close and latch correctly",
      commitment: "instructed",
      page: 2,
      quote: "Rectify the warehouse doors so that both leaves close and latch correctly.",
    },
    {
      text: "Replacement of the bakery floor covering",
      commitment: "proposed",
      page: 2,
      quote: "Replacement of the bakery floor covering, quoted at",
    },
  ],
  requirements: [
    {
      text: "All operatives to hold a valid CSCS card",
      page: 2,
      quote: "All operatives to hold a valid CSCS card.",
    },
    {
      text: "Works to be carried out outside trading hours",
      page: 2,
      quote: "Works to be carried out outside trading hours.",
    },
    {
      // Invented. Plausible for a PO, and nowhere in this one.
      text: "A hot works permit is required before any cutting or grinding",
      page: 2,
      quote: "A hot works permit is required before any cutting or grinding.",
    },
  ],
};

const checked = parseExtraction(modelReply, pages);
check("the reading succeeds", checked.ok === true, checked.ok ? "" : checked.error);

const content = checked.ok ? checked.extraction.content : null;
check(
  "the invented requirement is gone",
  !JSON.stringify(content).includes("hot works permit"),
  "a requirement nobody wrote must never become one the report writer believes",
);
check("and it is reported as dropped", checked.ok && checked.extraction.dropped.length === 1);
check(
  "the two real requirements survived",
  content.requirements.length === 2 &&
    content.requirements.every((item) => /CSCS|trading hours/.test(item.text)),
);
check(
  "the sloppy page number was corrected rather than the field thrown away",
  content.fields.length === 2 && content.fields.find((f) => f.key === "site").page === 1,
);
check("and the correction was reported", checked.ok && checked.extraction.relocated.length === 1);
check(
  "the quoted work is still quoted work",
  content.scope_items.find((item) => /floor covering/.test(item.text)).commitment === "proposed",
);
check(
  "and the instructed work is still instructed",
  content.scope_items.filter((item) => item.commitment === "instructed").length === 2,
);
check(
  "every surviving item still carries a page and a quote",
  [...content.fields, ...content.scope_items, ...content.requirements].every(
    (item) => Number.isInteger(item.page) && item.page > 0 && item.quote.length > 0,
  ),
);

console.log("\n4. The document joins the brief without rewriting it");

description = appendBriefEntry(
  description,
  documentEntryText("Lidl PO 4501234567", PO_ID),
  "2026-09-01 14:38",
);
check("the spoken brief is still first, with its own time", description.startsWith("[2026-09-01 07:12]"));
check("and its words are untouched", description.includes(SPOKEN));
check("the document is a later entry", description.includes("[2026-09-01 14:38] Job document added"));

console.log("\n5. What the AI is handed");

const documents = [
  {
    title: "Lidl PO 4501234567",
    kind: content.document_kind,
    summary: content.summary,
    fields: content.fields.map((f) => ({ label: f.label, value: f.value, page: f.page })),
    scopeItems: content.scope_items.map((i) => ({
      text: i.text,
      commitment: i.commitment,
      page: i.page,
    })),
    requirements: content.requirements.map((r) => ({ text: r.text, page: r.page })),
  },
];

const block = documentContextBlock(documents);
check("the quoted item is labelled PROPOSED in capitals", /PROPOSED: Replacement of the bakery floor covering/.test(block));
check("the instructed items are labelled INSTRUCTED", (block.match(/INSTRUCTED:/g) ?? []).length === 2);
check("every line carries its page", /\[p1\]/.test(block) && /\[p2\]/.test(block));
check("the rules travel with it", block.includes(DOCUMENT_CONTEXT_RULES));
check(
  "and they forbid writing scope as work done",
  /Never write any of it as completed, in\s*\n?\s*progress, started/.test(DOCUMENT_CONTEXT_RULES),
);
check(
  "they forbid promoting quoted work",
  /never write it as\s*\n?\s*though they had/.test(DOCUMENT_CONTEXT_RULES),
);
check(
  "they forbid inventing requirements",
  /never add the standards, permits or\s*\n?\s*method/.test(DOCUMENT_CONTEXT_RULES),
);
check(
  "and they keep the brief's history intact",
  /It does not erase the brief/.test(DOCUMENT_CONTEXT_RULES),
);

const combined = jobContextBlock(briefForPrompt(description), documents);
check("the brief and the documents are both in the block", combined.includes("JOB BRIEF") && combined.includes(JOB_DOCUMENT_LABEL));
check("the brief comes first", combined.indexOf("JOB BRIEF") < combined.indexOf(JOB_DOCUMENT_LABEL));
check(
  "a job with paperwork and no spoken brief still gets its scope",
  (jobContextBlock(null, documents) ?? "").includes(JOB_DOCUMENT_LABEL),
);
check("and a job with neither gets nothing at all", jobContextBlock(null, []) === null);

console.log("\n6. Generating the Daily: the scope is understood, and nothing is claimed");

// One day's notes. The sink was done; the doors were looked at and no more.
const dailyPrompt = buildPrompt({
  projectName: "Store 1848",
  client: "Lidl GB Limited",
  siteAddress: "Store 1848",
  reportDate: "2026-09-01",
  weather: "Dry",
  authorName: "M. Korzeniak",
  workforce: [],
  plant: [],
  photos: [],
  rawNotes:
    "Renewed the trap and waste on the bakery sink, tested and no leaks. Looked at the warehouse doors, the bottom guide is worn, parts ordered.",
  jobBrief: combined,
  cleanedSections: [],
});

check("the sink is in the prompt as scope", /bakery sink/.test(dailyPrompt));
check("so are the warehouse doors", /warehouse doors/.test(dailyPrompt));
check(
  "the writer is told this is scope and not evidence",
  /IS SCOPE, NOT EVIDENCE/.test(dailyPrompt),
);
check(
  "and told the documents are not a record of work done",
  /never a record of work done/.test(dailyPrompt),
);
check(
  "the floor covering is present, and marked as not instructed",
  /PROPOSED: Replacement of the bakery floor covering/.test(dailyPrompt),
);
check(
  "the notes themselves are still what the report is written from",
  /Renewed the trap and waste on the bakery sink/.test(dailyPrompt),
);
check(
  "nothing in the prompt claims the doors were rectified",
  !/(doors[^.]{0,40}(rectified|completed|repaired)\b)/i.test(
    dailyPrompt.replace(/Rectify the warehouse doors[^\n]*/g, ""),
  ),
  "the only mention of rectifying the doors is the scope item, quoted from the PO",
);
check(
  "and the invented hot works permit never reaches the writer",
  !/hot works/i.test(dailyPrompt),
);

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL DOCUMENT INTELLIGENCE CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
