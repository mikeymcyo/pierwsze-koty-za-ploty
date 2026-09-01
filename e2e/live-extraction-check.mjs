/**
 * One real extraction against a real model. Nothing synthetic.
 *
 * Every other suite in this repository runs without a key, which is what makes
 * them worth running. This one is the opposite and exists for one reason: the
 * quote check only works if the model quotes verbatim, and no amount of
 * offline testing can tell us whether it does.
 *
 *   OPENAI_API_KEY=sk-... npm run check:live-extraction
 *
 * It touches NO database, NO storage and NO project. It builds a disposable
 * two-page purchase order in memory, reads it with the shipping PDF text
 * layer, calls the shipping extraction with the shipping prompt and schema,
 * and reports what came back against what the document actually says.
 *
 * It is a report, not an assertion suite. The judgement about whether an item
 * was rightly dropped belongs to a person reading the output, because "wrongly
 * dropped" is exactly the thing a test cannot decide for itself.
 */

import { buildSamplePurchaseOrder } from "./support/sample-po.mjs";
import { extractPdfText, pagesForPrompt } from "../lib/documents/pdf-text.ts";
import { extractFromDocument, EXTRACTION_MODEL } from "../lib/ai/document-extraction.ts";
import { extractionContentSchema, locateQuote } from "../lib/documents/extraction-schema.ts";
import { jobContextBlock } from "../lib/ai/job-context.ts";
import { appendBriefEntry, briefForPrompt, documentEntryText } from "../lib/projects/job-brief.ts";

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error(
    "\nNo OPENAI_API_KEY in the environment.\n\n" +
      "  OPENAI_API_KEY=sk-... npm run check:live-extraction\n\n" +
      "Nothing was called and nothing was written.",
  );
  process.exit(2);
}

const rule = (title) => console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);

rule("1. The document");

const bytes = await buildSamplePurchaseOrder();
const read = await extractPdfText(bytes);
if (!read.ok) {
  console.error(`The PDF could not be read: ${read.error}`);
  process.exit(1);
}
const pages = read.text.pages;
console.log(`${bytes.length} bytes, ${read.text.pageCount} pages, truncated: ${read.text.truncated}`);
for (const page of pages) {
  console.log(`\n--- PAGE ${page.page} AS THE MODEL SEES IT ---\n${page.text}`);
}

rule("2. The call");

console.log(`Model configured: ${EXTRACTION_MODEL}`);
const startedAt = Date.now();
const result = await extractFromDocument(
  {
    title: "Lidl PO 4501234567",
    docTypeLabel: "Client instruction",
    projectName: "Disposable test project",
    pages: pagesForPrompt(pages),
    truncated: read.text.truncated,
  },
  pages,
);
const elapsed = Date.now() - startedAt;
console.log(`Elapsed: ${(elapsed / 1000).toFixed(1)}s`);

if (!result.ok) {
  console.log(`\nFAILED: ${result.error}`);
  if (result.raw !== undefined) {
    console.log("\nWhat the model returned:\n" + JSON.stringify(result.raw, null, 2));

    // The most useful thing when a run fails: which quotes were not verbatim,
    // and by how much. A near miss is a prompt problem; nonsense is not.
    const parsed = extractionContentSchema.safeParse(result.raw);
    if (parsed.success) {
      rule("Quotes that did not survive");
      for (const [kind, items] of [
        ["field", parsed.data.fields],
        ["scope_item", parsed.data.scope_items],
        ["requirement", parsed.data.requirements],
      ]) {
        for (const item of items) {
          if (locateQuote(item.quote, pages, item.page) === null) {
            console.log(`\n[${kind}] claimed p${item.page}\n  quote: ${JSON.stringify(item.quote)}`);
          }
        }
      }
    }
  }
  process.exit(1);
}

const { extraction } = result;

rule("3. What came back, after the check");

console.log(`document_kind: ${extraction.content.document_kind ?? "(none)"}`);
console.log(`summary: ${extraction.content.summary ?? "(none)"}`);

console.log("\nFIELDS");
for (const field of extraction.content.fields) {
  console.log(`  ${field.key} = ${field.value}  [p${field.page}]`);
  console.log(`      quote: ${JSON.stringify(field.quote)}`);
}

console.log("\nSCOPE ITEMS");
for (const item of extraction.content.scope_items) {
  console.log(`  ${item.commitment.toUpperCase()}: ${item.text}  [p${item.page}]`);
  console.log(`      quote: ${JSON.stringify(item.quote)}`);
}

console.log("\nREQUIREMENTS");
for (const item of extraction.content.requirements) {
  console.log(`  ${item.text}  [p${item.page}]`);
  console.log(`      quote: ${JSON.stringify(item.quote)}`);
}

rule("4. What the check did");

const total =
  extraction.content.fields.length +
  extraction.content.scope_items.length +
  extraction.content.requirements.length;
console.log(`Kept: ${total}`);
console.log(`Dropped (quote not in the document): ${extraction.dropped.length}`);
for (const item of extraction.dropped) {
  console.log(`  [${item.kind}] claimed p${item.claimedPage}: ${item.text}`);
}
console.log(`Page corrected: ${extraction.relocated.length}`);
for (const item of extraction.relocated) {
  console.log(`  [${item.kind}] p${item.claimedPage} -> p${item.actualPage}: ${item.text}`);
}

rule("5. Read this yourself - what the document actually says");

console.log(`
The order is two pages. It states:

  INSTRUCTED   Repair the leaking bakery sink, trap and waste connection
  INSTRUCTED   Rectify the warehouse doors so both leaves close and latch
  PROPOSED     Replacement of the bakery floor covering, quoted at 4,250.00,
               explicitly "not instructed" and needing a further written order
  CONDITIONS   CSCS cards; outside trading hours; left clean and trading safe
  IRRELEVANT   A November signage refresh under a separate programme, which
               this order explicitly does not cover

There is NO hot works requirement, NO permit requirement and NO completion
date. Anything above claiming otherwise is a fabrication that survived; any of
the five real items missing from section 3 is something valid that was lost.
The signage refresh appearing as a scope item is a failure even though it is
quotable - it is in the document, but it is not this job's scope.
`);

rule("6. The AI context block the Daily writer would be handed");

const description = appendBriefEntry(
  appendBriefEntry(
    null,
    "Attending Store 1848 to repair a leaking bakery sink and rectify the warehouse doors. Access may be difficult due to deliveries.",
    "2026-09-01 07:12",
  ),
  documentEntryText("Lidl PO 4501234567", "8c5de434-3eea-46c7-8a93-76723f3ce018"),
  "2026-09-01 14:38",
);

const block = jobContextBlock(briefForPrompt(description), [
  {
    title: "Lidl PO 4501234567",
    kind: extraction.content.document_kind,
    summary: extraction.content.summary,
    fields: extraction.content.fields.map((f) => ({
      label: f.label,
      value: f.value,
      page: f.page,
    })),
    scopeItems: extraction.content.scope_items.map((i) => ({
      text: i.text,
      commitment: i.commitment,
      page: i.page,
    })),
    requirements: extraction.content.requirements.map((r) => ({ text: r.text, page: r.page })),
  },
]);

console.log(block);

rule("Summary");
console.log(
  [
    `model:            ${result.model}`,
    `prompt version:   ${result.promptVersion}`,
    `elapsed:          ${(elapsed / 1000).toFixed(1)}s`,
    `kept:             ${total}`,
    `dropped:          ${extraction.dropped.length}`,
    `page corrected:   ${extraction.relocated.length}`,
  ].join("\n"),
);
