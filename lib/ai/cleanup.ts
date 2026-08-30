import "server-only";

import OpenAI from "openai";

import { glossaryBlock, statusDisciplineBlock } from "@/lib/ai/glossary";
import {
  cleanupRequest,
  formatCleanedSections,
  overLongSections,
  parseCleanupResponse,
  type CleanupDocumentKind,
  type CleanupInput,
  type CleanupSections,
} from "@/lib/ai/cleanup-prompt";

/**
 * The Cleanup AI call: raw or dictated site material in, professional section
 * text out.
 *
 * This is the first pass of three, and it replaces none of them: the drafting
 * pass writes the sections from the raw source with this draft alongside it,
 * and the Master AI Review reads the assembled document later and proposes
 * changes a person ticks. Cleanup only hands the drafting pass tidied wording
 * to work from.
 *
 * Everything that can be reasoned about without a network - the prompt, the
 * request body, the parsing, the three-sentence cap on the period summary -
 * lives in lib/ai/cleanup-prompt.ts, which loads in plain Node. This file is
 * the key, the client and the failure handling, and nothing else. What the
 * media list is built from lives in lib/ai/cleanup-context.ts.
 *
 * ## Failure is not fatal
 *
 * A cleanup that cannot run leaves the pipeline exactly as it was before this
 * layer existed: the review pass reads the raw material, as it always has, and
 * the user gets their report. No deployment without OPENAI_API_KEY changes
 * behaviour, and no outage of this call costs anybody their notes.
 */

export type { CleanupInput, CleanupDocumentKind, CleanupSections };

export type CleanupResult =
  | { ok: true; sections: CleanupSections }
  | { ok: false; error: string };

export const CLEANUP_MODEL = process.env.OPENAI_CLEANUP_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5.5";

export { formatCleanedSections };

export async function cleanupSections(
  input: CleanupInput,
  options: { baseURL?: string } = {},
): Promise<CleanupResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI cleanup is not configured on this deployment." };
  if (!input.source.trim()) return { ok: false, error: "There is nothing to clean up yet." };

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? (process.env.OPENAI_BASE_URL?.trim() || undefined),
  });

  try {
    const completion = await client.chat.completions.create(
      cleanupRequest(input, {
        model: CLEANUP_MODEL,
        glossary: glossaryBlock(),
        statusDiscipline: statusDisciplineBlock(),
      }),
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The cleanup pass returned nothing." };

    const parsed = parseCleanupResponse(input.kind, content);
    if (!parsed.ok) return parsed;
    if (Object.keys(parsed.sections).length === 0) {
      return { ok: false, error: "The cleanup pass produced no section text." };
    }

    // Noted, never acted on. A section that overran the length its brief asked
    // for is kept in full: trimming it would delete facts from a contractual
    // record, and the fix for a prompt the model keeps overrunning is the
    // prompt. This line is how anybody finds out that it is overrunning.
    for (const over of overLongSections(parsed.sections)) {
      console.warn(
        `[siteboss] cleanup ${input.kind}/${over.type} returned ${over.sentences} sentences where the brief asks for ${over.asked}; kept in full.`,
      );
    }

    return parsed;
  } catch (cause) {
    // Logged, never surfaced: the caller carries on with the raw material, so
    // there is nothing here for the user to act on.
    console.error("[siteboss] AI cleanup failed:", cause);
    return { ok: false, error: "The cleanup pass could not be reached." };
  }
}

/**
 * Runs cleanup and returns the block the Master AI Review is given, or an empty
 * list if cleanup could not run.
 *
 * The callers are server actions whose job is to produce a report; none of them
 * should have to decide what a failed cleanup means, and none of them should
 * fail because of one.
 */
export async function cleanedSectionsFor(
  input: CleanupInput,
): Promise<{ label: string; text: string }[]> {
  const result = await cleanupSections(input);
  if (!result.ok) {
    console.warn(`[siteboss] cleanup skipped for ${input.kind}: ${result.error}`);
    return [];
  }
  return formatCleanedSections(input.kind, result.sections);
}
