/**
 * How every AI layer is told to treat the job brief.
 *
 * The brief is what the job was sent out to do. It is the most useful context
 * this product has - a model that knows the visit was to repair a leaking
 * bakery sink and rectify the warehouse doors reads "sorted the doors" very
 * differently from one that does not - and it is also the most dangerous, for
 * exactly the same reason. A scope is a list of work somebody intends; a report
 * is a record of work that happened. Nothing may quietly turn one into the
 * other.
 *
 * So the rules live here, in one block, shared by the cleanup pass, the daily
 * and consolidated writers, the photograph describer and the Master AI Review.
 * One wording, asserted once.
 *
 * Pure, with no runtime imports and no path aliases.
 */

export const JOB_CONTEXT_RULES = [
  "THE JOB BRIEF IS SCOPE, NOT EVIDENCE",
  "",
  "The job brief says what this job was sent out to do. It is context for",
  "reading the site record - it is NOT a record of anything having happened.",
  "",
  "- Never write a scope item as work completed, in progress, or even started.",
  "  Only the site record evidences that, and a brief that lists four items on",
  "  a job where the notes describe one is a job where one was done.",
  "- Never invent a requirement, a specification, a quantity, a date or a",
  "  standard from the brief that the brief does not state.",
  "- Work described as quoted, proposed, offered, estimated or recommended is",
  "  NOT instructed work. Never write it as though it had been ordered, and",
  "  never let a later document turn it into an instruction unless that",
  "  document says so in those terms.",
  "- Use it to read what the notes mean: which door, which sink, which of the",
  "  items on the list a photograph is of. That is what it is for.",
  "",
  "WHEN A DOCUMENT ARRIVES LATER",
  "",
  "A brief is a series of entries, each with the time it was recorded, and a",
  "formal document - a purchase order, a specification, an instruction - is one",
  "of those entries. It carries more weight than a remembered conversation and",
  "should be preferred where the two disagree about what was asked for.",
  "",
  "It does not erase what came before it. A job described on the phone at seven",
  "and formalised at half past two was still described at seven, and a report",
  "that implies the works began only when the paperwork arrived is a false",
  "record. Where the order of events matters, say what the record says: the",
  "works were attended on the described basis and the instruction followed.",
].join("\n");

/**
 * What a photograph may and may not be said to show, given a scope.
 *
 * A tighter rule than the general one, because a caption is read as a fact
 * about that image and nobody checks it against the brief.
 */
export const PHOTO_SCOPE_RULES = [
  "RELATING A PHOTOGRAPH TO THE JOB SCOPE",
  "",
  "Where the job brief names an item and this photograph plainly shows it, you",
  "may say so: \"the warehouse door mechanism referenced in the job scope\".",
  "That is useful, and it is what the scope is for.",
  "",
  "Where you are not sure, say nothing about the scope. A photograph tied to the",
  "wrong item is worse than one tied to none, because it is read as a fact and",
  "nobody checks it. Do not guess from the order of the list, from how many",
  "items there are, or from the fact that a photograph exists at all.",
  "",
  "Never say a photograph shows work completed, approved, tested or signed off.",
  "It shows what it shows.",
].join("\n");


/**
 * What a document the AI has READ may and may not be turned into.
 *
 * The brief is somebody's words. This is a machine reading of a file, and it
 * carries a different danger: it looks like fact. Every item below was quoted
 * from the document and the quote was checked against the document's own text
 * before it got here (lib/documents/extraction-schema.ts), so what is present
 * is really in the paperwork - and that is exactly why the model must not be
 * allowed to treat it as more than paperwork.
 */
export const DOCUMENT_CONTEXT_RULES = [
  "READING THE JOB DOCUMENTS",
  "",
  "Each item below was copied out of a document on this job and checked back",
  "against that document. The words are the document's own. What they are NOT",
  "is a record of anything happening.",
  "",
  "- A document states intended work. Never write any of it as completed, in",
  "  progress, started, inspected, approved or signed off. Only the site",
  "  record evidences that.",
  "- INSTRUCTED work was ordered. PROPOSED work was quoted, offered,",
  "  estimated or recommended and nobody has ordered it - never write it as",
  "  though they had, and never let its presence imply it went ahead.",
  "  DESCRIBED work is neither; it is the document saying what a thing must",
  "  be.",
  "- Requirements are the document's conditions. State them only where the",
  "  site record makes them relevant, and never add the standards, permits or",
  "  method a document of this kind usually carries but this one does not.",
  "- Where a document and the spoken brief disagree about what was asked for,",
  "  the document carries more weight. It does not erase the brief: what was",
  "  described at seven was still described at seven.",
  "- Use the documents to read what the notes mean - which door, which sink,",
  "  which item a photograph is of. That is what they are for.",
].join("\n");

export const JOB_DOCUMENT_LABEL =
  "JOB DOCUMENTS THE AI HAS READ (quoted from the paperwork on this job and checked against it - intended work and conditions, never a record of work done):";

/** One document as a prompt sees it. Plain data, so this module stays pure. */
export type DocumentContext = {
  title: string;
  /** What the document calls itself, where it says. */
  kind: string | null;
  summary: string | null;
  fields: { label: string; value: string; page: number }[];
  scopeItems: { text: string; commitment: string; page: number }[];
  requirements: { text: string; page: number }[];
};

/**
 * One document, rendered.
 *
 * Page numbers are kept on every line. They are not decoration: the site
 * manager reading a draft that says something surprising needs to be able to
 * go to the page, and a claim with nowhere to go is a claim nobody can check.
 */
export function renderDocumentContext(document: DocumentContext): string {
  const lines = [`DOCUMENT: ${document.title}${document.kind ? ` (${document.kind})` : ""}`];
  if (document.summary) lines.push(document.summary);

  if (document.fields.length > 0) {
    lines.push("Particulars:");
    for (const field of document.fields) {
      lines.push(`- ${field.label}: ${field.value} [p${field.page}]`);
    }
  }

  if (document.scopeItems.length > 0) {
    lines.push("Work named in this document:");
    for (const item of document.scopeItems) {
      // The commitment is written in capitals and first, because it is the one
      // word that decides whether this may be written as work at all.
      lines.push(`- ${item.commitment.toUpperCase()}: ${item.text} [p${item.page}]`);
    }
  }

  if (document.requirements.length > 0) {
    lines.push("Conditions this document imposes:");
    for (const requirement of document.requirements) {
      lines.push(`- ${requirement.text} [p${requirement.page}]`);
    }
  }

  return lines.join("\n");
}

/** The whole document block, or null where no document has been read. */
export function documentContextBlock(documents: DocumentContext[]): string | null {
  if (documents.length === 0) return null;
  return [
    JOB_DOCUMENT_LABEL,
    documents.map(renderDocumentContext).join("\n\n"),
    "",
    DOCUMENT_CONTEXT_RULES,
  ].join("\n");
}

/** The heading the brief is given in a prompt, which says what it is and is not. */
export const JOB_BRIEF_LABEL =
  "JOB BRIEF AND SCOPE (what this job was sent out to do, in the order it was recorded - a later entry refines an earlier one and never deletes it):";

/**
 * The whole block a prompt is handed, or null where there is no brief.
 *
 * Assembled here rather than in the prompt modules, which carry no runtime
 * imports of their own - they take the finished block as a string, the same way
 * the cleanup prompt takes its glossary.
 */
export function jobContextBlock(
  brief: string | null | undefined,
  documents: DocumentContext[] = [],
): string | null {
  const text = typeof brief === "string" ? brief.trim() : "";
  const briefBlock = text ? [JOB_BRIEF_LABEL, text, "", JOB_CONTEXT_RULES].join("\n") : null;
  const documentBlock = documentContextBlock(documents);

  // A job with documents and no spoken brief is ordinary - the paperwork
  // arrived and nobody has dictated anything yet - and its scope must still
  // reach the model. Either half alone is a whole block.
  if (!briefBlock) return documentBlock;
  if (!documentBlock) return briefBlock;
  return [briefBlock, "", documentBlock].join("\n");
}
