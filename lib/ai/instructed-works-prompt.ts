/**
 * What the model is told when it fills in the instructed works table.
 *
 * A separate call from the prose sections, on purpose. A single response that
 * has to be both a careful table and four paragraphs of prose degrades both:
 * the table drifts into sentences and the prose starts reading like cells.
 * This asks for one thing.
 *
 * Pure, with no runtime imports and no path aliases, so what the model is
 * asked can be asserted in a test without a key or a network. The one import
 * is ./tone, a sibling under the same rule.
 */

import { SITE_MANAGER_TONE } from "./tone";

export const INSTRUCTED_WORKS_PROMPT_VERSION = "instructed-works-v2";

export const INSTRUCTED_WORKS_SYSTEM_PROMPT = [
  "You are an experienced UK construction site manager completing the instructed",
  "works table of a completion report for a client.",
  "",
  "One row per instructed item, in the order the instruction lists them. The",
  "table's whole value is that a client who sent a numbered list gets that list",
  "back with the answer against each item, so never merge two instructed items",
  "into one row and never invent a row the instruction does not contain.",
  "",
  "WHAT GOES IN EACH COLUMN",
  "",
  "- instruction: what was asked for, in the paperwork's own words. Shorten it,",
  "  but do not reword what it asks for.",
  "- location: where, as the record names it - \"Bay 39\", \"second floor plant",
  "  room\". Null if nothing names a place. Never guess a location from the",
  "  order of the list.",
  "- worksCarriedOut: what the site record says was actually done to that item,",
  "  with the materials, methods and dimensions the record gives. Leave it",
  "  EMPTY where the site record says nothing about this item. An empty cell is",
  "  a true statement about the record; a general sentence like \"works were",
  "  completed as instructed\" is not, and is the single worst thing you can put",
  "  in this table.",
  "- plateRefs: the plate numbers from the photograph list that show this item.",
  "  Only plates that are really in the list, and only where the caption or the",
  "  site record ties the photograph to THIS item. An empty list is correct and",
  "  common. A plate cited against the wrong item is a false statement about",
  "  evidence and nobody checks it.",
  "- status: one of Complete, Partially complete, Not confirmed, Not carried out.",
  "",
  "CHOOSING THE STATUS",
  "",
  "- Complete: the site record says this item was finished.",
  "- Partially complete: the record says some of it was done and some remains.",
  "- Not confirmed: the record does not say. This is the correct answer whenever",
  "  the evidence is silent, and it will be the answer for many rows. It does",
  "  NOT mean the work was skipped - it means nobody has recorded it yet.",
  "- Not carried out: use ONLY where the record explicitly says the work was not",
  "  done, was excluded, or was cancelled. Never infer it from missing evidence,",
  "  from an empty works column, or from an absent photograph.",
  "",
  "Silence is the normal state of a site record. A row you cannot evidence is",
  "Not confirmed with an empty works column, and that is a useful, honest row.",
  "Nothing you write may state or imply that work happened, was inspected,",
  "approved, tested or signed off unless the record says so in those terms.",
  "",
  "MATERIALS - USUALLY AN EMPTY LIST",
  "",
  "List a material only where the record names it and says what it was used",
  "for. Return an EMPTY list unless the job used several distinct named",
  "materials: a list with one entry is a sentence pretending to be a table,",
  "and it will be discarded. Never infer a material from the kind of work -",
  "a concrete repair does not tell you the mix.",
  "",
  "WORKSTREAMS - USUALLY AN EMPTY LIST",
  "",
  "A workstream describes HOW one substantial piece of work was carried out:",
  "the sequence, the make-up, the dimensions. It is for a job with enough",
  "going on to need it - a chamber taken down to base and rebuilt in courses",
  "earns one; a patch repair does not.",
  "",
  "Return an EMPTY list unless BOTH are true: the instruction has three or",
  "more items, and at least two of them involved work worth describing in its",
  "own right. On a simple job an empty list is the correct answer and the",
  "report is better for it.",
  "",
  "A workstream must NEVER restate the table. The table says what was asked",
  "for and what was carried out; a workstream says how. If all you can write",
  "is the works column again in longer words, do not write it.",
  "",
  SITE_MANAGER_TONE,
].join("\n");

export type InstructedWorksPromptInput = {
  projectName: string;
  client: string | null;
  /** The instructed items, from the job documents, one per line. */
  instruction: string;
  /** The site record for the whole job. */
  evidence: string;
  /** "P01 | BEFORE | caption" per line, or null where there are no photographs. */
  photographs: string | null;
};

export function buildInstructedWorksPrompt(input: InstructedWorksPromptInput): string {
  return [
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    "",
    "THE INSTRUCTION - one row per item below, in this order:",
    input.instruction,
    "",
    "THE SITE RECORD - what may be written in the works column:",
    input.evidence,
    "",
    input.photographs
      ? "PHOTOGRAPHS AVAILABLE TO CITE - reference | stage | caption. Cite only these:"
      : "PHOTOGRAPHS: none. Every plateRefs list must be empty.",
    input.photographs ?? "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** The JSON schema the model is held to. Mirrors instructedWorksSchema. */
export const INSTRUCTED_WORKS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "materials", "workstreams"],
  properties: {
    rows: {
      type: "array",
      description: "One row per instructed item, in the instruction's own order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["instruction", "location", "worksCarriedOut", "plateRefs", "status"],
        properties: {
          instruction: { type: "string", description: "What was asked for, in the paperwork's words." },
          location: { type: ["string", "null"], description: "Where, as the record names it. Null if unnamed." },
          worksCarriedOut: {
            type: "string",
            description:
              "What the site record says was done to this item. Empty string where the record says nothing.",
          },
          plateRefs: {
            type: "array",
            items: { type: "string" },
            description: "Plate numbers from the supplied list that show this item. Empty is correct and common.",
          },
          status: {
            type: "string",
            enum: ["Complete", "Partially complete", "Not confirmed", "Not carried out"],
            description:
              "Not confirmed whenever the record is silent. Not carried out only where the record explicitly says the work was not done.",
          },
        },
      },
    },
    materials: {
      type: "array",
      description:
        "Named materials the record states, with what each was used for. Empty unless the job used several distinct ones.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["material", "use"],
        properties: {
          material: { type: "string", description: "As the record names it." },
          use: { type: "string", description: "What it was used for, from the record." },
        },
      },
    },
    workstreams: {
      type: "array",
      description:
        "How a substantial piece of work was carried out - sequence, make-up, dimensions. Empty on a simple job. Never a restatement of the table.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body", "plateRefs"],
        properties: {
          heading: { type: "string", description: "What the work was, e.g. Drainage chamber rebuild - Bay 39." },
          body: { type: "string", description: "How it was done, from the record only." },
          plateRefs: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
