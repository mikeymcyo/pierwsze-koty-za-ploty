/**
 * What "extracted from a document" is allowed to mean.
 *
 * A model handed a purchase order will happily return an order number that is
 * not in it. That is the whole problem: the output looks identical either way,
 * and by the time it has been read into a report as job scope, nobody can tell
 * which half was read and which half was invented.
 *
 * So an extracted item is not a claim, it is a citation. Every field, every
 * scope item and every requirement carries the page it came from and the
 * words on that page that carry it - and those words are then CHECKED against
 * the text the model was actually given. A quote that is not in the document
 * is not a lower-confidence extraction, it is a fabrication, and it is dropped
 * before anything downstream ever sees it.
 *
 * That check is mechanical, which is the point. It does not need the model to
 * be honest, and it does not need a person to read the document to find out.
 *
 * Pure, with no runtime imports and no path aliases, so the rules load into
 * Node and are tested without a key, a network or a database.
 */

import { z } from "zod";

/**
 * How firmly the document commits to a piece of work.
 *
 * The distinction the job context rules already draw, made structural. A
 * purchase order instructs; a quotation proposes; a specification describes
 * what a thing must be without ordering anybody to do it. Flattening the three
 * into "scope" is how quoted work ends up in a report as instructed work.
 */
export const COMMITMENTS = ["instructed", "proposed", "described"] as const;
export type Commitment = (typeof COMMITMENTS)[number];

export const COMMITMENT_LABELS: Record<Commitment, string> = {
  instructed: "Instructed",
  proposed: "Proposed or quoted",
  described: "Described",
};

/** The citation every extracted item carries. */
const citation = {
  /** 1-based, as printed. */
  page: z.number().int().positive(),
  /** Verbatim from the document. Checked; not taken on trust. */
  quote: z.string().trim().min(1).max(600),
};

const fieldSchema = z.object({
  /** snake_case, so two extractions of the same document agree on names. */
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "A field key is lower case with underscores"),
  /** What a person would call it. */
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(300),
  ...citation,
});

const scopeItemSchema = z.object({
  text: z.string().trim().min(1).max(400),
  commitment: z.enum(COMMITMENTS),
  ...citation,
});

const requirementSchema = z.object({
  text: z.string().trim().min(1).max(400),
  ...citation,
});

export const extractionContentSchema = z.object({
  /** What the document calls itself, in its own words. Not our enum. */
  document_kind: z.string().trim().max(80).nullable(),
  /** One to three sentences saying what this document is. No conclusions. */
  summary: z.string().trim().max(800).nullable(),
  fields: z.array(fieldSchema).max(60),
  scope_items: z.array(scopeItemSchema).max(60),
  requirements: z.array(requirementSchema).max(60),
});

export type ExtractionContent = z.infer<typeof extractionContentSchema>;
export type ExtractedField = z.infer<typeof fieldSchema>;
export type ExtractedScopeItem = z.infer<typeof scopeItemSchema>;
export type ExtractedRequirement = z.infer<typeof requirementSchema>;

/** One page of the document as text, exactly as the model was given it. */
export type DocumentPage = { page: number; text: string };

/** An item that did not survive the check, and why. */
export type DroppedItem = {
  kind: "field" | "scope_item" | "requirement";
  text: string;
  claimedPage: number;
  reason: "not_in_document";
};

/** An item whose quote was real but on a different page than it claimed. */
export type RelocatedItem = {
  kind: "field" | "scope_item" | "requirement";
  text: string;
  claimedPage: number;
  actualPage: number;
};

export type VerifiedExtraction = {
  content: ExtractionContent;
  dropped: DroppedItem[];
  relocated: RelocatedItem[];
};

/**
 * The comparison form of a piece of text.
 *
 * Whitespace goes entirely. A PDF text layer breaks lines mid-phrase, spaces
 * out letters in headings and puts a newline between a number and its unit, so
 * comparing with spaces intact would reject quotes that are plainly present -
 * and a check that fires on honest output is a check people turn off.
 *
 * The typographic characters are folded for the same reason: a document
 * containing a curly apostrophe and a model returning a straight one are the
 * same words.
 */
export function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/­/g, "")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/\s+/g, "");
}

/**
 * Where a quote actually appears, or null if it appears nowhere.
 *
 * The claimed page is tried first, so a correct citation costs one comparison.
 */
export function locateQuote(quote: string, pages: DocumentPage[], claimedPage: number): number | null {
  const needle = comparable(quote);
  if (!needle) return null;

  const claimed = pages.find((page) => page.page === claimedPage);
  if (claimed && comparable(claimed.text).includes(needle)) return claimedPage;

  for (const page of pages) {
    if (page.page === claimedPage) continue;
    if (comparable(page.text).includes(needle)) return page.page;
  }
  return null;
}

/**
 * Checks a parsed extraction against the document it claims to come from.
 *
 * An item whose quote is somewhere else in the document keeps its content and
 * has its page corrected - the citation was sloppy, not false, and throwing
 * away a true reading because a page number drifted would lose real
 * information. An item whose quote is nowhere is dropped, and the caller is
 * told, because there is no reading there to keep.
 */
export function verifyAgainstSource(
  content: ExtractionContent,
  pages: DocumentPage[],
): VerifiedExtraction {
  const dropped: DroppedItem[] = [];
  const relocated: RelocatedItem[] = [];

  function check<T extends { page: number; quote: string }>(
    items: T[],
    kind: DroppedItem["kind"],
    describe: (item: T) => string,
  ): T[] {
    const kept: T[] = [];
    for (const item of items) {
      const actual = locateQuote(item.quote, pages, item.page);
      if (actual === null) {
        dropped.push({ kind, text: describe(item), claimedPage: item.page, reason: "not_in_document" });
        continue;
      }
      if (actual !== item.page) {
        relocated.push({ kind, text: describe(item), claimedPage: item.page, actualPage: actual });
      }
      kept.push({ ...item, page: actual });
    }
    return kept;
  }

  return {
    content: {
      ...content,
      fields: check(content.fields, "field", (item) => `${item.label}: ${item.value}`),
      scope_items: check(content.scope_items, "scope_item", (item) => item.text),
      requirements: check(content.requirements, "requirement", (item) => item.text),
    },
    dropped,
    relocated,
  };
}

/** Whether an extraction found anything at all worth keeping. */
export function isEmpty(content: ExtractionContent): boolean {
  return (
    content.fields.length === 0 &&
    content.scope_items.length === 0 &&
    content.requirements.length === 0
  );
}

/**
 * Reads what the model returned, then checks it.
 *
 * Both halves are here rather than at the call site so nothing can use the
 * parsed output without the check having run.
 */
export function parseExtraction(
  raw: unknown,
  pages: DocumentPage[],
):
  | { ok: true; extraction: VerifiedExtraction }
  | { ok: false; error: string } {
  const parsed = extractionContentSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join(".") || "the response";
    return { ok: false, error: `The model returned an extraction this app cannot read (${where}).` };
  }

  const extraction = verifyAgainstSource(parsed.data, pages);
  if (isEmpty(extraction.content)) {
    return {
      ok: false,
      error:
        extraction.dropped.length > 0
          ? "Nothing the model reported could be found in the document. Nothing has been recorded."
          : "Nothing could be read from this document.",
    };
  }
  return { ok: true, extraction };
}

/**
 * The JSON schema the model is held to.
 *
 * Written out rather than generated, because it is a contract with an external
 * service and reading it should not require running anything. It mirrors the
 * Zod schema above; the test asserts the two agree on their required keys, so
 * they cannot drift apart unnoticed.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_kind", "summary", "fields", "scope_items", "requirements"],
  properties: {
    document_kind: {
      type: ["string", "null"],
      description: "What the document calls itself, in its own words. Null if it does not say.",
    },
    summary: {
      type: ["string", "null"],
      description:
        "One to three sentences saying what this document is. Describe the document; do not draw conclusions about the work.",
    },
    fields: {
      type: "array",
      description:
        "Reference numbers, dates, parties, values and other named particulars stated in the document.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "value", "page", "quote"],
        properties: {
          key: { type: "string", description: "Lower case with underscores, e.g. order_number." },
          label: { type: "string", description: "What a person would call it, e.g. Order number." },
          value: { type: "string", description: "The value as the document states it." },
          page: { type: "integer", description: "The page it appears on, 1-based." },
          quote: {
            type: "string",
            description: "The exact words from that page that carry this. Copied, never paraphrased.",
          },
        },
      },
    },
    scope_items: {
      type: "array",
      description: "Pieces of work the document names.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "commitment", "page", "quote"],
        properties: {
          text: { type: "string", description: "The item of work, in the document's own terms." },
          commitment: {
            type: "string",
            enum: ["instructed", "proposed", "described"],
            description:
              "instructed: the document orders this work. proposed: it is quoted, offered, estimated or recommended. described: the document describes it without ordering it.",
          },
          page: { type: "integer" },
          quote: { type: "string" },
        },
      },
    },
    requirements: {
      type: "array",
      description:
        "Things the document requires: controls, standards, method, PPE, restrictions, conditions.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "page", "quote"],
        properties: {
          text: { type: "string" },
          page: { type: "integer" },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;
