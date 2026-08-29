import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import {
  MASTER_REVIEW_SYSTEM_PROMPT,
  buildMasterReviewPrompt,
  type MasterReviewInput,
} from "@/lib/ai/master-review-prompt";
import type { ProposedSection, ReviewWarning } from "@/lib/reports/master-review";

/**
 * Reviews an assembled report as one document.
 *
 * Returns a proposal and writes nothing. What the caller does with it is
 * decided by a person: lib/reports/master-review.ts reconciles this reply
 * against the report as it actually stands, and only the sections the user
 * ticks are ever saved.
 *
 * One call, one report. The photographs are represented by their status and
 * caption rather than their pixels - a description already written and
 * accepted is better evidence of what a photograph shows than a second look at
 * it would be, and re-reading twelve images to tidy some prose is not worth
 * anybody's money.
 */
export type MasterReviewResult =
  | {
      ok: true;
      sections: ProposedSection[];
      warnings: ReviewWarning[];
      assessment: string;
    }
  | { ok: false; error: string };

const replySchema = z.object({
  reviewedSections: z.array(
    z.object({
      sectionType: z.string(),
      proposedText: z.string(),
      changed: z.boolean(),
      reason: z.string(),
    }),
  ),
  warnings: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      message: z.string(),
      relatedSection: z.string(),
    }),
  ),
  overallAssessment: z.string(),
});

export async function reviewReportAsWhole(
  input: MasterReviewInput,
): Promise<MasterReviewResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };

  const written = input.sections.filter((section) => section.content.trim());
  if (written.length === 0) {
    return {
      ok: false,
      error: "There is nothing to review yet. Write or draft a section or two first.",
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
      messages: [
        { role: "system", content: MASTER_REVIEW_SYSTEM_PROMPT },
        { role: "user", content: buildMasterReviewPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "master_report_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reviewedSections: {
                type: "array",
                description:
                  "Every section supplied, in the order supplied, changed or not.",
                items: {
                  type: "object",
                  properties: {
                    sectionType: {
                      type: "string",
                      description: "Exactly as supplied. Never invent a section type.",
                    },
                    proposedText: {
                      type: "string",
                      description:
                        "The complete text for this section, not a fragment or a description of an edit. Empty string to empty the section. Identical to the original where nothing needed changing.",
                    },
                    changed: { type: "boolean" },
                    reason: {
                      type: "string",
                      description:
                        "One short sentence for a site manager, only where something changed. Empty string otherwise.",
                    },
                  },
                  required: ["sectionType", "proposedText", "changed", "reason"],
                  additionalProperties: false,
                },
              },
              warnings: {
                type: "array",
                description:
                  "Contradictions and gaps for a person to resolve. Never resolved here, and never applied to the report.",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["contradiction", "missing", "wording", "other"],
                    },
                    severity: { type: "string", enum: ["high", "medium", "low"] },
                    message: {
                      type: "string",
                      description:
                        "What is wrong, naming both places for a contradiction. Plain English, one or two sentences.",
                    },
                    relatedSection: {
                      type: "string",
                      description:
                        "The section type it concerns, or an empty string where it concerns the report as a whole.",
                    },
                  },
                  required: ["type", "severity", "message", "relatedSection"],
                  additionalProperties: false,
                },
              },
              overallAssessment: {
                type: "string",
                description:
                  "One or two sentences on the report as a whole. No score and no praise.",
              },
            },
            required: ["reviewedSections", "warnings", "overallAssessment"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned nothing. Try again." };

    const parsed = replySchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false, error: "The review did not come back in the expected shape. Try again." };
    }

    return {
      ok: true,
      sections: parsed.data.reviewedSections.map((section) => ({
        sectionType: section.sectionType,
        proposedText: section.proposedText,
        reason: section.reason,
      })),
      warnings: parsed.data.warnings.map((warning) => ({
        type: warning.type as ReviewWarning["type"],
        severity: warning.severity as ReviewWarning["severity"],
        message: warning.message,
        relatedSection: warning.relatedSection || null,
      })),
      assessment: parsed.data.overallAssessment,
    };
  } catch (cause) {
    console.error("[siteboss] master review failed:", cause);
    return {
      ok: false,
      error:
        cause instanceof Error && /api key|401|invalid/i.test(cause.message)
          ? "The AI key was rejected. Check OPENAI_API_KEY."
          : "The AI service could not be reached. Your report is untouched - try again shortly.",
    };
  }
}
