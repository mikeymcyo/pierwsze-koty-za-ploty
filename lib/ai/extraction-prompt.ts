/**
 * What the model is told when it reads a job document.
 *
 * Pure, with no runtime imports and no path aliases, so what the model is
 * asked can be asserted in a test without a key or a network.
 *
 * The instruction here is narrower than anywhere else in this product, because
 * the output is narrower. Nothing this returns is prose for a person to read
 * and correct: it becomes job context, and job context is what every other AI
 * layer reads a site manager's notes against. A requirement invented here
 * becomes a requirement the daily writer believes.
 *
 * Two things carry that weight, and they are different in kind:
 *
 *  - The rules below, which the model may or may not follow.
 *  - The quote check in lib/documents/extraction-schema.ts, which does not
 *    depend on the model following anything.
 *
 * The prompt says the quotes are checked. That is not a threat, it is the most
 * useful thing it can be told: a model that knows a fabricated quote will be
 * discarded has no reason to produce one, and every reason to leave a list
 * empty instead.
 */

/**
 * Stamped onto every extraction row.
 *
 * A bad extraction has to be traceable to the instructions that produced it,
 * and every other extraction from the same instructions has to be findable.
 * Bump this whenever the wording below changes in a way that could change what
 * comes back.
 */
export const EXTRACTION_PROMPT_VERSION = "extract-v1";

export const EXTRACTION_SYSTEM_PROMPT = [
  "You read construction job documents - purchase orders, specifications,",
  "RAMS, method statements, permits, instructions and delivery notes - and",
  "report what they say. You do not interpret, advise, or draw conclusions.",
  "",
  "EVERY ITEM MUST BE QUOTED FROM THE DOCUMENT",
  "",
  "For every field, scope item and requirement you report, give the page it is",
  "on and copy the words from that page that carry it. Copy them exactly as",
  "printed - do not paraphrase, correct, tidy, expand an abbreviation or",
  "translate them. The quote is your evidence, not a summary of it.",
  "",
  "Your quotes are checked against the document automatically. Anything whose",
  "quote is not in the document is discarded before anyone sees it. So if you",
  "cannot quote something, do not report it: an empty list is a correct and",
  "useful answer, and a fabricated item is worse than a missing one.",
  "",
  "A DOCUMENT SAYS WHAT IS TO BE DONE, NEVER WHAT WAS DONE",
  "",
  "This is a document about intended work. It is not a record of anything",
  "having happened. Never describe an item as completed, in progress, started,",
  "attended, inspected, approved, tested or signed off. Whether any of it",
  "happened is recorded elsewhere, by the people who did it.",
  "",
  "INSTRUCTED WORK AND QUOTED WORK ARE NOT THE SAME THING",
  "",
  "Mark each scope item with how firmly the document commits to it:",
  "",
  "- instructed: the document orders this work. A purchase order, a written",
  "  instruction, a signed variation.",
  "- proposed: the document quotes, offers, estimates or recommends it. A",
  "  priced option nobody has ordered is proposed, however definite the",
  "  wording of the work itself.",
  "- described: the document describes it without ordering anybody to do it.",
  "  A specification clause describing what a finish must be.",
  "",
  "Where the document says an item is not instructed, or requires a further",
  "order, that item is proposed. Never promote it.",
  "",
  "DO NOT INVENT REQUIREMENTS",
  "",
  "Report a requirement only where the document states it. Do not add the",
  "standards, permits, PPE, method or sequencing that a document of this kind",
  "usually carries, and do not complete a partial one from what is normal.",
  "An unstated requirement reported here becomes a requirement the report",
  "writer believes.",
  "",
  "WHAT TO REPORT",
  "",
  "- fields: named particulars the document states - order and reference",
  "  numbers, dates, revisions, parties, sites, values. Use lower case keys",
  "  with underscores, and the same key for the same thing every time.",
  "- scope_items: pieces of work the document names, in its own terms.",
  "- requirements: conditions, controls, standards, restrictions and method",
  "  the document imposes.",
  "- summary: one to three sentences saying what this document is. Describe",
  "  the document, not the job, and draw no conclusions about the work.",
  "- document_kind: what the document calls itself. Null if it does not say.",
  "",
  "Report nothing else, and report nothing twice.",
].join("\n");

export type ExtractionPromptInput = {
  /** What the document is called on this job. */
  title: string;
  /** The type somebody filed it under, which may be wrong. */
  docTypeLabel: string;
  projectName: string;
  /** The pages, marked up with the page numbers the model must cite. */
  pages: string;
  /** True where the document was longer than the pages supplied. */
  truncated: boolean;
};

export function buildExtractionPrompt(input: ExtractionPromptInput): string {
  const lines = [
    `PROJECT: ${input.projectName}`,
    `DOCUMENT: ${input.title}`,
    // Named as a filing decision rather than a fact, because it is one - a
    // person picked it from a list at upload, often before reading the file.
    `FILED AS: ${input.docTypeLabel} (how it was filed, which may not be what it is)`,
    "",
  ];

  if (input.truncated) {
    lines.push(
      "NOTE: this document is longer than the pages below. Report only what is",
      "on these pages, and never from a page you have not been given.",
      "",
    );
  }

  lines.push(
    "The document follows, one page at a time. Each page is opened by its",
    "number in square brackets. Quote only from the page you cite.",
    "",
    input.pages,
  );

  return lines.join("\n");
}
