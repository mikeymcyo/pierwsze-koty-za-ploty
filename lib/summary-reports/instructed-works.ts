/**
 * The instructed works table: what was asked for, what was done, and how the
 * reader can check it.
 *
 * The spine of a professional completion report. A client who was sent a list
 * of eight numbered items wants those eight items back, in order, each with
 * the work carried out against it, the photographs that evidence it, and a
 * status. Prose cannot do that job - it is the one place a table is worth more
 * than any paragraph.
 *
 * Pure, with no runtime imports and no path aliases, so the rules load into
 * Node and are tested without a database or a model.
 *
 * ## Why "Not confirmed" is the default and "Not carried out" is not
 *
 * Missing evidence is not evidence of absence. A site manager who photographed
 * six bays out of eight has not told us the other two were skipped - he has
 * told us nothing about them, and a report that says "Not carried out" has
 * invented a fact against its own author. "Not confirmed" is the honest word
 * for it, and it is what the reader needs to see to know what to chase.
 *
 * "Not carried out" is reserved for the case where the record explicitly says
 * so: somebody said the work was not done, or the document instructs something
 * that was expressly excluded. That is a fact, and it is allowed to be stated.
 */

import { z } from "zod";

import { significantWords } from "../reports/prepare-gate";

export const INSTRUCTED_WORK_STATUSES = [
  "Complete",
  "Partially complete",
  "Not confirmed",
  "Not carried out",
] as const;

export type InstructedWorkStatus = (typeof INSTRUCTED_WORK_STATUSES)[number];

/** The status a row falls back to whenever the model offers one we do not know. */
export const DEFAULT_STATUS: InstructedWorkStatus = "Not confirmed";

export const instructedWorkRowSchema = z.object({
  /** What the paperwork asked for, in its own words. */
  instruction: z.string().trim().min(1).max(300),
  /** Where, as the record names it. Null where nothing names a location. */
  location: z.string().trim().max(120).nullable(),
  /**
   * What the site record says was actually done. Empty where the record says
   * nothing - which is a fact about the record, not a failing of the writer.
   */
  worksCarriedOut: z.string().trim().max(600),
  /** P01, P07 ... checked against the plates that exist before this is stored. */
  plateRefs: z.array(z.string().trim().regex(/^P\d{2,3}$/)).max(12),
  status: z.enum(INSTRUCTED_WORK_STATUSES),
});

export type InstructedWorkRow = z.infer<typeof instructedWorkRowSchema>;

/**
 * A material the record names, and what it was used for.
 *
 * Only worth a table when the job actually used several. One row saying
 * "concrete - the repair" is a sentence pretending to be a table, so the gate
 * below drops it and the works column keeps the fact.
 */
export const materialSchema = z.object({
  material: z.string().trim().min(1).max(120),
  use: z.string().trim().min(1).max(200),
});

/**
 * One piece of work described in its own right: how it was done, not that it
 * was done. The table already says what was asked for and what was carried
 * out; this is the method, the sequence and the make-up, and it earns its
 * place only on a job with enough going on to need it.
 */
export const workstreamSchema = z.object({
  heading: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1200),
  plateRefs: z.array(z.string().trim().regex(/^P\d{2,3}$/)).max(12),
});

export const instructedWorksSchema = z.object({
  rows: z.array(instructedWorkRowSchema).max(40),
  // Optional so a payload written before these existed still parses. An older
  // report reads back as a table with no materials and no workstreams, which
  // is exactly what it was.
  materials: z.array(materialSchema).max(20).optional(),
  workstreams: z.array(workstreamSchema).max(8).optional(),
});

export type Material = z.infer<typeof materialSchema>;
export type Workstream = z.infer<typeof workstreamSchema>;

export type InstructedWorks = {
  rows: InstructedWorkRow[];
  materials: Material[];
  workstreams: Workstream[];
};

/**
 * Whether a materials table is worth printing.
 *
 * Two or more distinct materials, or nothing. A table with a single row tells
 * a client less than the sentence it came from, and a heading over it is the
 * kind of forced section that makes a simple job read like a manual.
 */
export function materialsWorthPrinting(materials: Material[]): boolean {
  const distinct = new Set(materials.map((entry) => entry.material.trim().toLowerCase()));
  return distinct.size >= 2;
}

/**
 * Whether the job is complex enough for written workstreams.
 *
 * Two or more of them AND three or more instructed items. A two-item job
 * described in two headed passages is the table again with more words round
 * it, and that is the duplication this product keeps having to remove.
 */
export function workstreamsWorthPrinting(workstreams: Workstream[], rowCount: number): boolean {
  return workstreams.length >= 2 && rowCount >= 3;
}

/**
 * Whether a status is one the record can actually support.
 *
 * Complete and Partially complete are claims about work having happened, so
 * they need something in the works column to stand on. Without it the row
 * falls back to Not confirmed - the instruction is still listed, which is the
 * point of the table, but nothing is asserted about it.
 */
export function supportedStatus(row: {
  worksCarriedOut: string;
  status: InstructedWorkStatus;
}): InstructedWorkStatus {
  const said = row.worksCarriedOut.trim().length > 0;
  if (said) return row.status;
  // "Not carried out" is a statement the record made; it survives an empty
  // works column, because "we did not do this" is itself the answer.
  return row.status === "Not carried out" ? row.status : DEFAULT_STATUS;
}

/**
 * A row as it will be stored: citations that resolve, a status the record
 * supports, and nothing else changed.
 */
export function sanitiseRow(row: InstructedWorkRow, plateCount: number): InstructedWorkRow {
  const known = new Set<string>();
  for (let index = 0; index < plateCount; index += 1) {
    const n = index + 1;
    known.add(`P${n < 10 ? `0${n}` : String(n)}`);
  }
  const plateRefs = row.plateRefs.filter((ref) => known.has(ref));
  // Deduplicated and ordered, so "P07, P03, P07" reads as "P03, P07".
  const ordered = [...new Set(plateRefs)].sort();
  return {
    ...row,
    plateRefs: ordered,
    status: supportedStatus(row),
  };
}

export function sanitiseRows(rows: InstructedWorkRow[], plateCount: number): InstructedWorkRow[] {
  return rows.map((row) => sanitiseRow(row, plateCount));
}

/**
 * Whether something raised on site is part of what was instructed.
 *
 * Crude word matching on purpose, and it decides only which heading an issue
 * prints under - never whether it was done, and never whether it is anybody's
 * fault. A defect that shares no words with any instructed item is reported as
 * found outside the instruction, which is the commercially important
 * distinction: it evidences new work without implying it was included.
 *
 * Where nothing was instructed, nothing can be outside it, so everything reads
 * as ordinary and the split does not appear at all.
 */
export function withinInstructedScope(text: string, rows: InstructedWorkRow[]): boolean {
  if (rows.length === 0) return true;
  const said = significantWords(text);
  const flat = flatten(text);
  if (said.size === 0 && !flat) return true;

  return rows.some((row) => {
    // The location first, and as a phrase. Site defects are identified by
    // where they are - "Bay 39", "L2", "Plot 7" - and every one of those is
    // too short or too numeric to survive word matching. Filing an in-scope
    // defect as newly found is worse than the reverse: it tells a client that
    // work was discovered when it was always part of the instruction.
    if (locationMentioned(flat, row.location)) return true;
    for (const word of significantWords(`${row.instruction} ${row.location ?? ""}`)) {
      if (said.has(word)) return true;
    }
    return false;
  });
}

/** Lower case, with everything but letters and digits reduced to single spaces. */
function flatten(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Whether a location reads as a phrase inside the text. */
function locationMentioned(flatText: string, location: string | null): boolean {
  if (!location) return false;
  const needle = flatten(location).trim();
  // One short token on its own - "bay", "roof" - is not an identification.
  if (!needle || !/\d/.test(needle) ? needle.length < 6 : false) return false;
  return flatText.includes(` ${needle} `);
}

/**
 * How the table is stored.
 *
 * JSON in the section's `content`, which is a text column. The alternative -
 * a table of its own - would be a second schema for something that is part of
 * one report's prose record, versioned with it, frozen with it when the report
 * is issued, and meaningless apart from it.
 */
export function serialiseInstructedWorks(
  rows: InstructedWorkRow[],
  materials: Material[] = [],
  workstreams: Workstream[] = [],
): string {
  // The gates are applied here rather than at the call site, so nothing can
  // store a one-row materials table or a pair of workstreams on a two-item
  // job by forgetting to ask.
  return JSON.stringify(
    {
      rows,
      ...(materialsWorthPrinting(materials) ? { materials } : {}),
      ...(workstreamsWorthPrinting(workstreams, rows.length) ? { workstreams } : {}),
    },
    null,
    0,
  );
}

/**
 * Reads the table back, and returns null for anything that is not one.
 *
 * Total: a section written before this existed, or edited by hand into prose,
 * reads as null and the document prints nothing rather than throwing.
 */
export function parseInstructedWorks(content: string | null | undefined): InstructedWorks | null {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text.startsWith("{")) return null;
  try {
    const parsed = instructedWorksSchema.safeParse(JSON.parse(text));
    if (!parsed.success || parsed.data.rows.length === 0) return null;
    const materials = parsed.data.materials ?? [];
    const workstreams = parsed.data.workstreams ?? [];
    return {
      rows: parsed.data.rows,
      // Checked again on the way out: a payload written by an older version,
      // or edited by hand, must not print a table the rules would not have
      // stored.
      materials: materialsWorthPrinting(materials) ? materials : [],
      workstreams: workstreamsWorthPrinting(workstreams, parsed.data.rows.length)
        ? workstreams
        : [],
    };
  } catch {
    return null;
  }
}

/** The plate references as one cell: "P03, P07" - or an em dash for none. */
export function plateCell(plateRefs: string[]): string {
  return plateRefs.length > 0 ? plateRefs.join(", ") : "—";
}
