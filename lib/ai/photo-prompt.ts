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
 * So the instruction is narrow: describe what is visible, name what the
 * supplied context already establishes, and stop.
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
};

export const PHOTO_DESCRIPTION_SYSTEM_PROMPT = [
  "You write one-sentence captions for photographs in UK construction site reports.",
  "",
  "You are shown a single photograph and some context recorded on site. Write a",
  "short, factual, professional description of what the photograph shows, in",
  "British English, suitable to print beneath it in a report sent to a client.",
  "",
  "DESCRIBE ONLY WHAT IS THERE",
  "",
  "Two things may appear in your description, and nothing else:",
  "",
  "1. What is plainly visible in the photograph.",
  "2. Facts given to you in the context below - the project, the location, the",
  "   date, the status, the user's own caption.",
  "",
  "If the context names a location, you may use it: \"rear loading bay\" is a",
  "supplied fact. If it does not, do not place the photograph anywhere.",
  "",
  "NEVER STATE",
  "",
  "- that anything is complete, completed, finished or installed",
  "- that anything is compliant, approved, certified, signed off, inspected,",
  "  tested, correct, satisfactory, adequate, safe or to specification",
  "- dimensions, quantities, areas, depths, gauges or thicknesses",
  "- a material or product you cannot plainly identify by sight",
  "- a manufacturer, specification or product name",
  "- a location, level, room, plot or elevation not given in the context",
  "- the cause of a defect, damage or deviation",
  "- who did the work, who is responsible, or who is at fault",
  "- when the work was done, beyond a date supplied in the context",
  "- that a test, inspection or handover took place",
  "- any judgement of workmanship or quality",
  "",
  "WRITE INSTEAD",
  "",
  "Name what is visible and where it is in the frame. Prefer \"visible\",",
  "\"present\", \"in place\", \"shown\" over any word implying an outcome.",
  "",
  "Bad:  \"Completed compliant fire stopping installation.\"",
  "Good: \"Fire-stopping material visible around service penetrations within the",
  "      wall opening.\"",
  "",
  "Bad:  \"Correctly installed 100mm blockwork to the party wall.\"",
  "Good: \"Blockwork visible to the full height of the opening.\"",
  "",
  "Bad:  \"Damage caused by the groundworks contractor.\"",
  "Good: \"Damage visible to the kerb edging.\"",
  "",
  "IF YOU CANNOT TELL",
  "",
  "Describe less. A short description of what is unmistakably there is worth",
  "more than a confident one that goes beyond the image. Never guess to fill a",
  "sentence, and never say that something is absent - a photograph shows what is",
  "in the frame, not what is missing from the site.",
  "",
  "FORMAT: one sentence, at most about twenty-five words. No preamble, no",
  "quotation marks, no markdown, no trailing full-stop commentary. Return the",
  "sentence and nothing else.",
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
    "",
    input.existingCaption
      ? `THE SITE MANAGER'S OWN CAPTION (his words - build on this, never contradict it): ${input.existingCaption}`
      : "THE SITE MANAGER HAS NOT WRITTEN A CAPTION.",
    "",
    input.reportContext
      ? `RECORDED ON SITE THAT DAY (context only - do not assume the photograph shows any of it):\n${input.reportContext}`
      : "NO FURTHER SITE CONTEXT WAS RECORDED.",
    "",
    "Describe the photograph.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
