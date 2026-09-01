import "server-only";

import { extractFromDocument, EXTRACTION_MODEL } from "@/lib/ai/document-extraction";
import { jobContextBlock } from "@/lib/ai/job-context";
import {
  extractionContentSchema,
  locateQuote,
  type DocumentPage,
} from "@/lib/documents/extraction-schema";
import { extractPdfText, pagesForPrompt } from "@/lib/documents/pdf-text";
import { buildSamplePurchaseOrder } from "@/lib/documents/sample-purchase-order";
import { appendBriefEntry, briefForPrompt, documentEntryText } from "@/lib/projects/job-brief";

/**
 * One real extraction against the configured model, and a report on it.
 *
 * The only question offline testing cannot answer is whether the model quotes
 * verbatim. If it paraphrases, the quote check drops good items and an
 * extraction reads as empty - and that failure looks like "the AI found
 * nothing in my purchase order", not like an error.
 *
 * So this runs the shipping path - the shipping PDF text layer, the shipping
 * prompt, the shipping schema, the shipping check - against a purchase order
 * built in memory, and reports what happened in enough detail for a person to
 * judge it.
 *
 * It touches NOTHING. No project, no document row, no extraction row, no
 * storage object, no live data of any kind: the PDF exists only as bytes in
 * this function, and the reading is returned rather than saved. Running it
 * twice changes nothing either time.
 *
 * A person has to read the output. "Was that item rightly dropped" is exactly
 * the judgement a test cannot make for itself, so the report prints what the
 * document actually says beside what came back.
 */

export type ExtractionCheckReport = {
  ok: boolean;
  text: string;
  /** For a caller that wants the numbers rather than the prose. */
  stats: {
    model: string;
    promptVersion: string | null;
    elapsedMs: number;
    kept: number;
    dropped: number;
    relocated: number;
  };
};

/** What the order says, written out so the report can be judged against it. */
const WHAT_THE_DOCUMENT_SAYS = `
The order is two pages. It states:

  INSTRUCTED   Repair the leaking bakery sink, trap and waste connection
  INSTRUCTED   Rectify the warehouse doors so both leaves close and latch
  PROPOSED     Replacement of the bakery floor covering, quoted at 4,250.00,
               explicitly "not instructed" and needing a further written order
  CONDITIONS   CSCS cards; outside trading hours; left clean and trading safe
  IRRELEVANT   A November signage refresh under a separate programme, which
               this order explicitly does not cover

There is NO hot works requirement, NO permit requirement and NO completion
date. Anything above claiming otherwise is a fabrication that survived the
check; any of the five real items missing is something valid that was lost.

The signage refresh appearing as a scope item is a failure even though it is
genuinely quotable - being in the document is not the same as being this job's
scope, so the quote check cannot catch it and only the prompt can.
`.trim();

function rule(title: string): string {
  return `\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`;
}

/** Every quote in a reply that is not in the document, and where it claimed to be. */
function quoteFailures(raw: unknown, pages: DocumentPage[]): string[] {
  const parsed = extractionContentSchema.safeParse(raw);
  if (!parsed.success) return [`The reply did not match the schema: ${parsed.error.issues[0]?.message}`];

  const lines: string[] = [];
  const groups: [string, { page: number; quote: string }[]][] = [
    ["field", parsed.data.fields],
    ["scope_item", parsed.data.scope_items],
    ["requirement", parsed.data.requirements],
  ];
  for (const [kind, items] of groups) {
    for (const item of items) {
      if (locateQuote(item.quote, pages, item.page) === null) {
        lines.push(`[${kind}] claimed p${item.page}: ${JSON.stringify(item.quote)}`);
      }
    }
  }
  return lines;
}

export async function runExtractionCheck(): Promise<ExtractionCheckReport> {
  const out: string[] = [];
  const fail = (text: string, elapsedMs = 0): ExtractionCheckReport => ({
    ok: false,
    text: [...out, text].join("\n"),
    stats: { model: EXTRACTION_MODEL, promptVersion: null, elapsedMs, kept: 0, dropped: 0, relocated: 0 },
  });

  out.push(rule("1. The document"));
  const bytes = await buildSamplePurchaseOrder();
  const read = await extractPdfText(bytes);
  if (!read.ok) return fail(`The PDF could not be read: ${read.error}`);

  const pages = read.text.pages;
  out.push(
    `${bytes.length} bytes, ${read.text.pageCount} pages, truncated: ${read.text.truncated}`,
  );
  for (const page of pages) {
    out.push(`\n--- PAGE ${page.page} AS THE MODEL SEES IT ---\n${page.text}`);
  }

  out.push(rule("2. The call"));
  out.push(`Model configured: ${EXTRACTION_MODEL}`);

  const startedAt = Date.now();
  const result = await extractFromDocument(
    {
      title: "Lidl PO 4501234567",
      docTypeLabel: "Client instruction",
      projectName: "Disposable validation document",
      pages: pagesForPrompt(pages),
      truncated: read.text.truncated,
    },
    pages,
  );
  const elapsedMs = Date.now() - startedAt;
  out.push(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

  if (!result.ok) {
    out.push(`\nFAILED: ${result.error}`);
    if (result.raw !== undefined) {
      out.push(rule("Quotes that did not survive"));
      const failures = quoteFailures(result.raw, pages);
      out.push(failures.length ? failures.join("\n") : "(none - the reply failed for another reason)");
      out.push(rule("What the model returned"));
      out.push(JSON.stringify(result.raw, null, 2));
    }
    out.push(rule("What the document actually says"));
    out.push(WHAT_THE_DOCUMENT_SAYS);
    return fail("", elapsedMs);
  }

  const { extraction } = result;
  const content = extraction.content;

  out.push(rule("3. What came back, after the check"));
  out.push(`document_kind: ${content.document_kind ?? "(none)"}`);
  out.push(`summary: ${content.summary ?? "(none)"}`);

  out.push("\nFIELDS");
  for (const field of content.fields) {
    out.push(`  ${field.key} = ${field.value}  [p${field.page}]`);
    out.push(`      quote: ${JSON.stringify(field.quote)}`);
  }
  if (content.fields.length === 0) out.push("  (none)");

  out.push("\nSCOPE ITEMS");
  for (const item of content.scope_items) {
    out.push(`  ${item.commitment.toUpperCase()}: ${item.text}  [p${item.page}]`);
    out.push(`      quote: ${JSON.stringify(item.quote)}`);
  }
  if (content.scope_items.length === 0) out.push("  (none)");

  out.push("\nREQUIREMENTS");
  for (const item of content.requirements) {
    out.push(`  ${item.text}  [p${item.page}]`);
    out.push(`      quote: ${JSON.stringify(item.quote)}`);
  }
  if (content.requirements.length === 0) out.push("  (none)");

  const kept = content.fields.length + content.scope_items.length + content.requirements.length;

  out.push(rule("4. What the check did"));
  out.push(`Kept: ${kept}`);
  out.push(`Dropped (quote not in the document): ${extraction.dropped.length}`);
  for (const item of extraction.dropped) {
    out.push(`  [${item.kind}] claimed p${item.claimedPage}: ${item.text}`);
  }
  out.push(`Page corrected: ${extraction.relocated.length}`);
  for (const item of extraction.relocated) {
    out.push(`  [${item.kind}] p${item.claimedPage} -> p${item.actualPage}: ${item.text}`);
  }

  // Every quote that failed, even on a run that succeeded overall: a run that
  // kept nine items and silently dropped a real one is the failure this whole
  // exercise exists to catch.
  const failures = quoteFailures(result.raw, pages);
  if (failures.length > 0) {
    out.push("\nQuotes that were not verbatim enough to survive:");
    out.push(failures.join("\n"));
  }

  out.push(rule("5. Read this yourself - what the document actually says"));
  out.push(WHAT_THE_DOCUMENT_SAYS);

  out.push(rule("6. The AI context block the Daily writer would be handed"));
  const description = appendBriefEntry(
    appendBriefEntry(
      null,
      "Attending Store 1848 to repair a leaking bakery sink and rectify the warehouse doors. Access may be difficult due to deliveries.",
      "2026-09-01 07:12",
    ),
    documentEntryText("Lidl PO 4501234567", "8c5de434-3eea-46c7-8a93-76723f3ce018"),
    "2026-09-01 14:38",
  );
  out.push(
    jobContextBlock(briefForPrompt(description), [
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
    ]) ?? "(no block - nothing survived)",
  );

  out.push(rule("Summary"));
  out.push(
    [
      `model:            ${result.model}`,
      `prompt version:   ${result.promptVersion}`,
      `elapsed:          ${(elapsedMs / 1000).toFixed(1)}s`,
      `kept:             ${kept}`,
      `dropped:          ${extraction.dropped.length}`,
      `page corrected:   ${extraction.relocated.length}`,
      `quote failures:   ${failures.length}`,
    ].join("\n"),
  );

  return {
    ok: true,
    text: out.join("\n"),
    stats: {
      model: result.model,
      promptVersion: result.promptVersion,
      elapsedMs,
      kept,
      dropped: extraction.dropped.length,
      relocated: extraction.relocated.length,
    },
  };
}
