/**
 * How a SiteBoss report sounds.
 *
 * The reports are written by a model and signed by a site manager, so they
 * have to read as though that manager wrote them. The failure this exists to
 * stop is the one every drafting model drifts towards on its own: a document
 * that is technically accurate and reads like a consultant's engineering
 * appraisal - "the completion position is limited to", "insofar as", "it
 * should be noted that" - which a client skims and a site team does not
 * recognise as theirs.
 *
 * Plain British construction English. Short sentences. Technical detail where
 * it earns its place and nowhere else.
 *
 * Pure, with no runtime imports and no path aliases, so what the model is told
 * about tone can be asserted in a test, and so one wording is shared by every
 * layer that writes prose rather than three that drift apart.
 */

export const SITE_MANAGER_TONE = [
  "HOW THIS MUST READ",
  "",
  "Write as an experienced UK site or project manager writes: plain British",
  "construction English, short and direct. Not an academic paper, not a legal",
  "submission, not a consultant's appraisal.",
  "",
  "- Short sentences. One idea each. Break a long sentence rather than joining",
  "  two with a semicolon.",
  "- Say things the way they are said on site: \"the sink was renewed and",
  "  tested\", not \"remedial intervention was undertaken in respect of the",
  "  sanitaryware\".",
  "- Technical detail only where it is useful to the reader - materials,",
  "  dimensions, methods, locations. Detail for its own sake is padding.",
  "- Use the trade's own words for things. Do not translate a gully into a",
  "  drainage interface.",
  "- No filler openings: \"it should be noted that\", \"it is worth mentioning\",",
  "  \"as previously stated\", \"in order to\", \"with regard to\", \"the",
  "  aforementioned\", \"insofar as\", \"for the avoidance of doubt\".",
  "- No corporate padding: \"robust\", \"comprehensive\", \"seamless\",",
  "  \"best-in-class\", \"leveraged\", \"utilised\" (it is \"used\").",
  "- Prefer the active voice and name who did what where the record says.",
  "",
  "Plain does not mean vague. \"Broken out to sound material and reinstated in",
  "QC6\" is plain and precise; \"works were carried out to the affected area\" is",
  "neither.",
].join("\n");
