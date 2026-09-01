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
export function jobContextBlock(brief: string | null | undefined): string | null {
  const text = typeof brief === "string" ? brief.trim() : "";
  if (!text) return null;
  return [JOB_BRIEF_LABEL, text, "", JOB_CONTEXT_RULES].join("\n");
}
