import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { summarySectionsFor } from "@/lib/summary-reports/sections";
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
};

export type SummaryGenerationResult =
  | { ok: true; sections: Partial<Record<SummarySectionType, string>> }
  | { ok: false; error: string };

const SYSTEM_PROMPT = [
  "You are an experienced UK construction site manager consolidating issued site records into a client-facing report.",
  "The supplied evidence is authoritative. Rewrite and consolidate it, but never add a fact, quantity, cause, status, certification, approval, inspection, quality judgement or programme claim that is not explicitly present.",
  "Prefer an issued progress report's reviewed wording over the daily records listed beneath it. Those daily records are provenance and must not be counted again.",
  "Silence is not evidence of absence. Return an empty string for a section the evidence does not support. Do not write 'none', 'no issues', 'on programme', 'completed satisfactorily', 'compliant', 'approved' or similar unless the evidence says it.",
  "Use British English, professional continuous prose and concise paragraphs. Do not use markdown or headings.",
  "A completion report records what the evidence says was completed; it is not itself a certificate of completion, compliance, handover or acceptance.",
].join("\n\n");

export async function generateSummarySections(
  input: SummaryGenerationInput,
): Promise<SummaryGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };

  if (!input.evidence.trim()) {
    return { ok: false, error: "The selected source reports contain no written evidence." };
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
    `DOCUMENT: ${input.kind === "progress" ? "PROGRESS REPORT" : "COMPLETION REPORT"}`,
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    input.siteAddress ? `SITE: ${input.siteAddress}` : null,
    input.periodStart && input.periodEnd
      ? `REPORTING PERIOD: ${input.periodStart} to ${input.periodEnd}`
      : "REPORTING PERIOD: whole project record",
    "",
    "ISSUED SOURCE EVIDENCE:",
    input.evidence,
    "",
    "ISSUE RECORD:",
    input.issues || "No issue rows were selected. Do not claim that no issues occurred.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
      return { ok: false, error: "The evidence did not support any report sections." };
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
