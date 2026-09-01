/**
 * The prompt for describing one site photograph.
 *
 * Pure, with no runtime imports and no path aliases, so what the model is told
 * can be asserted in a test without a key or a network.
 *
 * A photograph is the most dangerous thing to hand a model in this product.
 * Prose generation at least starts from notes a person dictated; here the model
 * is looking at pixels, and everything it might say about compliance, quality,
 * completion or cause would be invented from an image that cannot carry those
 * facts. A caption reading "completed compliant fire stopping" under a
 * photograph of a hole in a wall is a claim somebody could rely on in a
 * dispute.
 *
 * So the instruction is narrow: name what the photograph is evidence of, in the
 * language of the works, using only what is visible and what the context
 * already establishes - and stop.
 *
 * Narrow is not the same as literal, and the first version got that wrong. It
 * produced "an operative standing on a mobile scaffold tower reaching towards a
 * dome camera", which is an accurate description of a picture and worthless in
 * a report: it names no work, no element and no evidence. A caption earns its
 * place by saying why the photograph was taken. The examples below carry that
 * distinction, because the rule alone did not.
 */

export type PhotoDescriptionInput = {
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  /** The date of the report the photograph belongs to, when it has one. */
  reportDate: string | null;
  /** Before / During / After / Defect / Delivery / Other. */
  statusLabel: string | null;
  /** What the user has already written, if anything. */
  existingCaption: string | null;
  /** Anything the report already records that is safe to ground a description in. */
  reportContext: string | null;
  /**
   * What the report's own written sections say so far.
   *
   * The strongest context there is: a caption for a photograph on a report
   * whose Works completed section names a drainage run should say drainage
   * run. Supplied as prose, and never as licence to claim the photograph shows
   * any particular part of it.
   */
  writtenSections?: string | null;
  /**
   * The job brief and the rules for reading it, already assembled - see
   * jobContextBlock in lib/ai/job-context.ts.
   *
   * The most useful thing a caption can know and the easiest to misuse: it
   * tells the model which door and which sink, and it must never let a caption
   * claim this photograph is of a scope item unless the photograph plainly
   * shows it. The rules travel with it.
   */
  jobBrief?: string | null;
};

/**
 * What a caption may say about the job scope.
 *
 * The same words as PHOTO_SCOPE_RULES in lib/ai/job-context.ts, inlined because
 * this module carries no runtime imports - e2e/job-brief-smoke.mjs asserts the
 * two have not drifted apart.
 */
export const PHOTO_SCOPE_BLOCK = [
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

export const PHOTO_DESCRIPTION_SYSTEM_PROMPT = [
  "You write one-sentence captions for photographs in UK construction site",
  "reports. You are an experienced site manager captioning the record, not",
  "somebody describing a picture.",
  "",
  PHOTO_SCOPE_BLOCK,
  "",
  "SAY WHY THE PHOTOGRAPH WAS TAKEN, NOT WHAT IS IN THE FRAME",
  "",
  "A photograph in a report is evidence of something. The caption names that",
  "thing in the language of the works. It is not a narration of the scene, and",
  "it is not a list of the objects and people visible.",
  "",
  "Bad:  \"An operative standing on a mobile scaffold tower reaching towards a",
  "      dome camera mounted on the ceiling.\"",
  "Good: \"Installation works to the ceiling-mounted camera, accessed from a",
  "      mobile tower.\"",
  "",
  "Bad:  \"A tablet computer being held up showing a document with text on it.\"",
  "Good: \"RAMS documentation displayed digitally on site.\"",
  "",
  "Bad:  \"A large printed sheet with lines and numbers laid out on a table.\"",
  "Good: \"Construction drawing referenced during the works.\"",
  "",
  "Bad:  \"A wall in a room with some marks on it.\"",
  "Good: \"Cracking to the plaster finish at the head of the door opening.\"",
  "",
  "Bad:  \"Two men in hi-vis standing next to a trench.\"",
  "Good: \"Excavation open to the drainage run.\"",
  "",
  "Note what the good captions do. They name the work, the element, the defect",
  "or the document, and they use the terms a contractor uses. They do not count",
  "people, describe clothing, narrate posture, or mention the photograph itself.",
  "",
  "WHERE THE MEANING COMES FROM",
  "",
  "Three things, and nothing else:",
  "",
  "1. What is plainly visible in the photograph.",
  "2. The status chosen on site - Before, During, After, Defect, Delivery - which",
  "   tells you what the photograph is for.",
  "3. Facts given to you in the context below: the project, the location, the",
  "   date, the status, the user's own caption, and what the report records.",
  "",
  "Where the context names a location or an activity that the image plainly",
  "matches, use it: \"rear loading bay\" and \"drainage run\" are supplied facts.",
  "If it does not, do not place the photograph anywhere - name the work without",
  "saying where it is.",
  "",
  "Where the image is unmistakably a document - a drawing, a permit, a method",
  "statement, a certificate, a delivery note - say which, and say that it was",
  "displayed or referenced on site. Never say what it authorises, permits,",
  "approves or certifies: you can see that a document exists, not that it is in",
  "force.",
  "",
  "NEVER STATE",
  "",
  "- that anything is complete, completed, finished or installed to a standard",
  "- that anything is compliant, approved, certified, signed off, inspected,",
  "  tested, permitted, correct, satisfactory, adequate, safe or to specification",
  "- that a briefing, induction, inspection, test or handover took place",
  "- dimensions, quantities, areas, depths, gauges or thicknesses",
  "- a material or product you cannot plainly identify by sight",
  "- a manufacturer, specification or product name",
  "- a location, level, room, plot or elevation not given in the context",
  "- the cause of a defect, damage or deviation",
  "- who did the work, who is responsible, or who is at fault",
  "- when the work was done, beyond a date supplied in the context",
  "- any judgement of workmanship or quality",
  "",
  "Bad:  \"Completed compliant fire stopping installation.\"",
  "Good: \"Fire-stopping material visible around service penetrations within the",
  "      wall opening.\"",
  "",
  "A photograph of somebody working at height is evidence of the works and of",
  "the access being used. It is not evidence that the access was correct, that a",
  "permit was held, or that anybody was working safely - and a caption implying",
  "any of those is the one that gets read back in a dispute.",
  "",
  "Bad:  \"Operative working safely from a correctly erected mobile tower.\"",
  "Good: \"Works to the ceiling carried out from a mobile tower.\"",
  "",
  "IF YOU CANNOT TELL",
  "",
  "Describe less, and describe it in the language of the works. A short caption",
  "naming what is unmistakably there beats a confident one that goes beyond the",
  "image. Never guess to fill a sentence, and never say that something is absent",
  "- a photograph shows what is in the frame, not what is missing from the site.",
  "",
  "FORMAT: one sentence, at most about twenty-five words, impersonal, in",
  "British English. No preamble, no quotation marks, no markdown, and no",
  "commentary about the photograph or about the caption. Return the sentence",
  "and nothing else.",
].join("\n");

/**
 * The context block handed over with the image.
 *
 * The user's own caption is included so a regeneration can build on what they
 * meant rather than talking past it - but it is labelled as theirs, and the
 * model is told it is a starting point, never something to contradict.
 */
export function buildPhotoDescriptionPrompt(input: PhotoDescriptionInput): string {
  return [
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    input.siteAddress ? `SITE: ${input.siteAddress}` : null,
    input.reportDate ? `DATE RECORDED: ${input.reportDate}` : null,
    input.statusLabel ? `PHOTOGRAPH STATUS (chosen on site): ${input.statusLabel}` : null,
    ...(input.jobBrief ? ["", input.jobBrief] : []),
    "",
    input.existingCaption
      ? `THE SITE MANAGER'S OWN CAPTION (his words - build on this, never contradict it): ${input.existingCaption}`
      : "THE SITE MANAGER HAS NOT WRITTEN A CAPTION.",
    "",
    input.reportContext
      ? `RECORDED ON SITE THAT DAY (context only - do not assume the photograph shows any of it):\n${input.reportContext}`
      : "NO FURTHER SITE CONTEXT WAS RECORDED.",
    "",
    input.writtenSections
      ? `WHAT THIS REPORT ALREADY SAYS (use its terms where the image matches them; do not assume the photograph shows any of it):\n${input.writtenSections}`
      : null,
    input.writtenSections ? "" : null,
    "Describe the photograph.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
