/**
 * The hard-coded UK construction glossary the Cleanup AI writes to.
 *
 * Pure data with no runtime imports and no path aliases, so it loads straight
 * into Node and can be asserted without a model, a key or a network - the same
 * rule lib/ai/prompt.ts follows and for the same reason.
 *
 * ## Why this is hard-coded, and stays hard-coded
 *
 * Consistency is the whole point of the cleanup pass. Two site managers
 * describing the same wall write "patched it up" and "made good the render",
 * and a client reading a month of reports should see one term for one thing.
 * That only works if the terminology is fixed.
 *
 * Per-company configurable glossaries are deliberately NOT built. A company
 * that can rename terms can rename "observed" to "confirmed", and the status
 * discipline below - the part that keeps this a defensible contractual record
 * rather than a marketing document - would become a setting. If configurable
 * glossaries are ever added, STATUS_ESCALATIONS and NOT_UNLESS_SOURCED must
 * stay out of what can be configured.
 *
 * ## What may be added here
 *
 * Terms whose meaning is fixed across UK sites. Not house style, not a client's
 * preferred wording, and never a term that carries a status claim: adding
 * "compliant" as the preferred word for anything would defeat the layer.
 */

export type GlossaryTerm = {
  /** The term the report uses. */
  preferred: string;
  /** Site shorthand and dictation that means the same thing. */
  instead: readonly string[];
};

/**
 * Register and terminology. Left side is what goes in the report, right side is
 * what a dictated note tends to say.
 *
 * Every entry is a change of wording only. None of them adds a fact, and none
 * of them moves a status: "made good" and "patched up" describe the same work
 * to the same degree of completion.
 */
export const GLOSSARY: readonly GlossaryTerm[] = [
  { preferred: "operatives", instead: ["lads", "blokes", "guys", "men", "boys", "workers"] },
  { preferred: "plant", instead: ["machines", "kit", "gear", "machinery"] },
  { preferred: "the works", instead: ["the job", "the work we did"] },
  { preferred: "programme", instead: ["schedule", "timeline"] },
  { preferred: "making good", instead: ["patched up", "fixed up", "tidied up", "sorted out"] },
  { preferred: "localised repair", instead: ["small fix", "a patch", "bit of a repair"] },
  { preferred: "reinstatement", instead: ["put back", "put it back how it was"] },
  { preferred: "elevation", instead: ["side of the building", "face of the building", "wall outside"] },
  { preferred: "substrate", instead: ["the surface underneath", "what it sits on", "the backing"] },
  { preferred: "mechanical fixings", instead: ["screws and bolts", "rawl plugs", "fixings and screws"] },
  { preferred: "chemical anchors", instead: ["resin", "chemical anchor stuff", "glue-in bolts"] },
  { preferred: "redecoration", instead: ["repainting", "painted it again", "gave it a coat"] },
  { preferred: "snagging", instead: ["touch-ups", "little jobs left", "bits and pieces"] },
  { preferred: "setting out", instead: ["marking out", "marked where it goes"] },
  { preferred: "first fix", instead: ["1st fix"] },
  { preferred: "second fix", instead: ["2nd fix"] },
  { preferred: "excavation", instead: ["digging", "dug out"] },
  { preferred: "spoil", instead: ["muck", "dirt", "the dug-out stuff"] },
  { preferred: "muck away", instead: ["taking the spoil off site", "carting muck off"] },
  { preferred: "formwork", instead: ["shuttering", "boxing out"] },
  { preferred: "reinforcement", instead: ["rebar", "the steel", "steel bars"] },
  { preferred: "blockwork", instead: ["laying blocks", "blocks went up"] },
  { preferred: "brickwork", instead: ["laying bricks", "bricks went up"] },
  { preferred: "screed", instead: ["levelling the floor", "floor levelling"] },
  { preferred: "dry lining", instead: ["plasterboarding", "boarding out"] },
  { preferred: "damp-proof course (DPC)", instead: ["damp course", "damp proofing strip"] },
  { preferred: "scaffold", instead: ["scaff", "staging", "the tower"] },
  { preferred: "welfare facilities", instead: ["cabins", "the canteen", "the site hut"] },
  { preferred: "site establishment", instead: ["setting up site", "getting site going"] },
  { preferred: "temporary works", instead: ["props and supports", "the propping"] },
  { preferred: "toolbox talk", instead: ["safety chat", "quick safety talk"] },
  { preferred: "near miss", instead: ["close call", "nearly had one"] },
  { preferred: "drawing", instead: ["dwg", "the plan", "the print"] },
  {
    preferred: "risk assessment and method statement (RAMS)",
    instead: ["the paperwork", "method statement paperwork"],
  },
];

/** British spellings and conventions, so a month of reports reads as one document. */
export const BRITISH_CONVENTIONS: readonly string[] = [
  "-ise, never -ize: authorised, organised, minimised, utilised.",
  "metre, litre, tonne, kerb, storey, grey, aluminium, levelling, travelling.",
  "programme for a plan of work; program only for software.",
  "practice as the noun, practise as the verb; enquiry rather than inquiry.",
  "Dates in the order the source gives them; never convert a date to a different order.",
  "Numbers, units and reference numbers exactly as the source records them.",
];

export type StatusRule = {
  /** What the source records. */
  from: string;
  /** The stronger word the rewrite must not reach for. */
  to: string;
  /** Why the upgrade is a different claim, in the terms a dispute would use. */
  because: string;
};

/**
 * The five upgrades the cleanup pass must never make.
 *
 * Each pair looks like a synonym and is not. They are the words a dispute about
 * delay or defect turns on, and every one of them is a claim the raw notes do
 * not carry: the site manager said the work was installed, and only a test says
 * it was tested.
 *
 * This list is not configurable and must not become configurable.
 */
export const STATUS_ESCALATIONS: readonly StatusRule[] = [
  {
    from: "proposed",
    to: "instructed",
    because:
      "a proposal is somebody's suggestion; an instruction binds a party and can carry cost and time.",
  },
  {
    from: "observed",
    to: "confirmed",
    because: "observing something is one person looking; confirming it asserts that it was verified.",
  },
  {
    from: "installed",
    to: "tested",
    because: "installation says the item is in place; testing asserts a result nobody has recorded.",
  },
  {
    from: "completed",
    to: "approved",
    because: "completion is the contractor's account; approval is somebody else's decision.",
  },
  {
    from: "work carried out",
    to: "compliant or safe",
    because:
      "compliance and safety are judgements against a standard, made by an inspection the notes do not record.",
  },
];

/**
 * Terms that carry a formal status and may appear only when the source uses
 * them.
 *
 * These are not banned words - a note that says "we had an AI on Tuesday" is
 * recording an architect's instruction and should say so. What is banned is
 * reaching for one of them to describe something the source recorded more
 * loosely, which is exactly how "they told us to move it" becomes an
 * instruction and how "there is a mark on the render" becomes a defect.
 */
export const NOT_UNLESS_SOURCED: readonly string[] = [
  "instruction",
  "variation",
  "request for information (RFI)",
  "extension of time",
  "delay event",
  "defect",
  "non-conformance",
  "practical completion",
  "handover",
  "sign-off",
  "approval",
  "certificate",
  "inspection",
  "test",
];

/** The glossary as the model is shown it. */
export function glossaryBlock(): string {
  return [
    "GLOSSARY - use the term on the left wherever the source means the thing on",
    "the right. This is a change of wording only: it never changes what happened",
    "or how far it got.",
    "",
    ...GLOSSARY.map((term) => `- ${term.preferred}  <-  ${term.instead.join(", ")}`),
    "",
    "BRITISH ENGLISH AND CONVENTIONS",
    "",
    ...BRITISH_CONVENTIONS.map((line) => `- ${line}`),
  ].join("\n");
}

/** The status discipline as the model is shown it. */
export function statusDisciplineBlock(): string {
  return [
    "STATUS DISCIPLINE - NEVER UPGRADE",
    "",
    "Keep the level of certainty the source records. Each of these five upgrades",
    "is forbidden, because each one makes a different and stronger claim:",
    "",
    ...STATUS_ESCALATIONS.map(
      (rule) => `- ${rule.from} -> ${rule.to}: forbidden, because ${rule.because}`,
    ),
    "",
    "Never turn future or intended work into completed work. \"We are going to",
    "start the screed tomorrow\" is planned works, and stays in the future tense.",
    "",
    "Hedged wording in the source stays hedged: appears, seems, believed to be,",
    "reported by, to be confirmed. Do not resolve it, and do not drop it.",
    "",
    "The following terms carry a formal status and may be used ONLY where the",
    "source itself uses them or plainly records the thing they name:",
    "",
    `${NOT_UNLESS_SOURCED.join(", ")}.`,
  ].join("\n");
}
