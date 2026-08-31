import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { CLEANED_SECTIONS_LABEL } from "@/lib/ai/prompt";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/ai/summary-prompt";
import { evidenceHeading, provenanceInstruction } from "@/lib/summary-reports/provenance";
import { SUMMARY_KIND_LABELS, summarySectionsFor } from "@/lib/summary-reports/sections";
import type { SummaryReportKind, SummarySectionType } from "@/types/database";

export type SummaryGenerationInput = {
  kind: SummaryReportKind;
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  evidence: string;
  issues: string;
  /**
   * True where the report has no source reports behind it - a survey, or a
   * Progress Report written directly. The model is then told so plainly, and
   * the evidence is labelled for what it actually is.
   */
  standalone?: boolean;
  /**
   * The Cleanup AI's output for this document, already labelled.
   *
   * Optional: a cleanup that could not run leaves this empty and the prompt is
   * what it was before that layer existed. See lib/ai/cleanup.ts.
   */
  cleanedSections?: { label: string; text: string }[];
};

export type SummaryGenerationResult =
  | { ok: true; sections: Partial<Record<SummarySectionType, string>> }
  | { ok: false; error: string };


export async function generateSummarySections(
  input: SummaryGenerationInput,
): Promise<SummaryGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };

  if (!input.evidence.trim()) {
    return {
      ok: false,
      error:
        input.kind === "survey" || input.standalone
          ? "Write some notes, or add captioned photographs, before drafting. There is nothing to work from yet."
          : "The selected source reports contain no written evidence.",
    };
  }

  const definitions = summarySectionsFor(input.kind);
  const shape = Object.fromEntries(definitions.map((section) => [section.type, z.string()])) as Record<
    SummarySectionType,
    z.ZodString
  >;
  const schema = z.object(shape);
  const properties = Object.fromEntries(
    definitions.map((section) => [
      section.type,
      { type: "string", description: `${section.brief} Return an empty string when unsupported.` },
    ]),
  );

  const prompt = [
    // From the label map rather than a ternary: a survey went in here as
    // "COMPLETION REPORT", which is the one thing a survey must never be told
    // it is.
    `DOCUMENT: ${SUMMARY_KIND_LABELS[input.kind].toUpperCase()}`,
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    input.siteAddress ? `SITE: ${input.siteAddress}` : null,
    input.periodStart && input.periodEnd
      ? `REPORTING PERIOD: ${input.periodStart} to ${input.periodEnd}`
      : "REPORTING PERIOD: whole project record",
    // Before the evidence, never after: the evidence is the record, and the
    // last thing the model reads is what it is judged against.
    ...(input.cleanedSections?.length
      ? [
          "",
          CLEANED_SECTIONS_LABEL,
          input.cleanedSections.map((section) => `${section.label}: ${section.text}`).join("\n"),
        ]
      : []),
    "",
    // Labelled for what it is. A block headed "issued source evidence" is how
    // a model comes to write "as recorded in the daily reports" about a report
    // that has none.
    evidenceHeading(input.kind, Boolean(input.standalone)),
    input.evidence,
    "",
    "ISSUE RECORD:",
    input.issues || "No issue rows were selected. Do not claim that no issues occurred.",
    provenanceInstruction(Boolean(input.standalone)),
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `${input.kind}_report_sections`,
          strict: true,
          schema: {
            type: "object",
            properties,
            required: definitions.map((section) => section.type),
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned nothing. Try again." };
    const parsed = schema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false, error: "The model's reply did not match the expected report shape." };
    }

    const sections: Partial<Record<SummarySectionType, string>> = {};
    for (const definition of definitions) {
      const value = parsed.data[definition.type]?.trim();
      if (value) sections[definition.type] = value;
    }
    if (Object.keys(sections).length === 0) {
      // Evidence reached the model - the caller refuses to call it otherwise -
      // and it still wrote nothing. Say which, because "the evidence did not
      // support any report sections" reads as a verdict on the site manager's
      // reports when it is usually a retry away from working.
      return {
        ok: false,
        error:
          "The model read the evidence but returned no sections. Try again - if it keeps happening, check the source reports actually carry written content.",
      };
    }
    return { ok: true, sections };
  } catch (cause) {
    console.error("[siteboss] summary generation failed:", cause);
    return {
      ok: false,
      error:
        cause instanceof Error && /api key|401|invalid/i.test(cause.message)
          ? "The AI key was rejected. Check OPENAI_API_KEY."
          : "The AI service could not be reached. Your source reports are safe - try again shortly.",
    };
  }
}
