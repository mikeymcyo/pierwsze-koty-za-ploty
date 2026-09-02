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

export const instructedWorksSchema = z.object({
  rows: z.array(instructedWorkRowSchema).max(40),
});

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
 * How the table is stored.
 *
 * JSON in the section's `content`, which is a text column. The alternative -
 * a table of its own - would be a second schema for something that is part of
 * one report's prose record, versioned with it, frozen with it when the report
 * is issued, and meaningless apart from it.
 */
export function serialiseInstructedWorks(rows: InstructedWorkRow[]): string {
  return JSON.stringify({ rows }, null, 0);
}

/**
 * Reads the table back, and returns null for anything that is not one.
 *
 * Total: a section written before this existed, or edited by hand into prose,
 * reads as null and the document prints nothing rather than throwing.
 */
export function parseInstructedWorks(content: string | null | undefined): InstructedWorkRow[] | null {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text.startsWith("{")) return null;
  try {
    const parsed = instructedWorksSchema.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.rows.length > 0 ? parsed.data.rows : null;
  } catch {
    return null;
  }
}

/** The plate references as one cell: "P03, P07" - or an em dash for none. */
export function plateCell(plateRefs: string[]): string {
  return plateRefs.length > 0 ? plateRefs.join(", ") : "—";
}
