import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { SYSTEM_PROMPT, buildPrompt, type GenerationInput } from "@/lib/ai/prompt";
import { DAILY_DRAFTED_SECTIONS } from "@/lib/report-sections";
import type { ReportSectionType } from "@/types/database";

/**
 * Turns a site manager's dictated notes into report sections.
 *
 * The whole product rests on this being trustworthy. A construction progress
 * report is a contractual record: it gets sent to a client, and it can end up
 * in a dispute about who caused a delay. A model that smooths a thin note into
 * a confident paragraph about work nobody did would be worse than no feature at
 * all - so the prompt forbids invention, and allows silence. An empty section
 * is a correct answer.
 *
 * That is not the same as forbidding a rewrite. The notes are raw material and
 * the report is a professional document, so lifting the register, consolidating
 * repeated notes and using the right trade terms is the job. What may not move
 * is the facts, and in particular no claim about quality, compliance or
 * approval may appear that the notes do not already carry. lib/ai/prompt.ts
 * holds that instruction and the reasoning behind it.
 *
 * The raw notes are stored separately and verbatim, and shown next to this
 * output, so the user can always check what was written against what they said.
 */

export const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.5";

export function hasAiConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const sectionsSchema = z.object(
  Object.fromEntries(
    DAILY_DRAFTED_SECTIONS.map((section) => [section.type, z.string()]),
  ) as Record<ReportSectionType, z.ZodString>,
);

export type { GenerationInput };

export type GeneratedSections = Partial<Record<ReportSectionType, string>>;

export type GenerationResult =
  | { ok: true; sections: GeneratedSections }
  | { ok: false; error: string };

/**
 * `baseURL` exists so the pipeline can be exercised end to end against a local
 * stub in tests, without a real key and without spending anything.
 */
export async function generateSections(
  input: GenerationInput,
  options: { baseURL?: string } = {},
): Promise<GenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "AI drafting is not configured on this deployment." };
  }

  if (!input.rawNotes.trim()) {
    return {
      ok: false,
      error: "Add some notes about the day's work first - there is nothing to write up yet.",
    };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? (process.env.OPENAI_BASE_URL?.trim() || undefined),
  });

  const properties = Object.fromEntries(
    DAILY_DRAFTED_SECTIONS.map((section) => [
      section.type,
      { type: "string", description: section.brief },
    ]),
  );

  try {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "site_report_sections",
          strict: true,
          schema: {
            type: "object",
            properties,
            // Every key is required, but any of them may be "" - that is how the
            // model says "the notes do not cover this" without omitting a field.
            required: DAILY_DRAFTED_SECTIONS.map((section) => section.type),
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned nothing. Try again." };

    const parsed = sectionsSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false, error: "The model's reply did not match the expected shape." };
    }

    const sections: GeneratedSections = {};
    for (const [type, text] of Object.entries(parsed.data)) {
      const trimmed = text.trim();
      if (trimmed) sections[type as ReportSectionType] = trimmed;
    }

    if (Object.keys(sections).length === 0) {
      return {
        ok: false,
        error: "Nothing could be written from those notes. Try describing the day in more detail.",
      };
    }

    return { ok: true, sections };
  } catch (cause) {
    // The real message goes to the server log via instrumentation.ts; the user
    // gets something they can act on.
    console.error("[siteboss] AI generation failed:", cause);
    return {
      ok: false,
      error:
        cause instanceof Error && /api key|401|invalid/i.test(cause.message)
          ? "The AI key was rejected. Check OPENAI_API_KEY."
          : "The AI service could not be reached. Your notes are saved - try again in a moment.",
    };
  }
}
