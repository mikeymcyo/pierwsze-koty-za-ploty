import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { REPORT_SECTIONS } from "@/lib/report-sections";
import type { ReportSectionType } from "@/types/database";

/**
 * Turns a site manager's dictated notes into report sections.
 *
 * The whole product rests on this being trustworthy. A construction progress
 * report is a contractual record: it gets sent to a client, and it can end up
 * in a dispute about who caused a delay. A model that smooths a thin note into
 * a confident paragraph about work nobody did would be worse than no feature at
 * all - so the prompt's first job is to forbid invention, and the second is to
 * allow silence. An empty section is a correct answer.
 *
 * The raw notes are stored separately and verbatim, and shown next to this
 * output, so the user can always check what was written against what they said.
 */

export const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.5";

export function hasAiConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export type GenerationInput = {
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  reportDate: string;
  weather: string | null;
  authorName: string | null;
  workforce: { company_name: string; trade: string | null; operatives: number }[];
  plant: { description: string; quantity: number }[];
  photos: { category: string; caption: string | null }[];
  rawNotes: string;
};

const sectionsSchema = z.object(
  Object.fromEntries(
    REPORT_SECTIONS.map((section) => [section.type, z.string()]),
  ) as Record<ReportSectionType, z.ZodString>,
);

export type GeneratedSections = Partial<Record<ReportSectionType, string>>;

function buildPrompt(input: GenerationInput): string {
  const workforce = input.workforce.length
    ? input.workforce
        .map(
          (row) =>
            `- ${row.company_name}${row.trade ? ` (${row.trade})` : ""}: ${row.operatives} operative(s)`,
        )
        .join("\n")
    : "- none recorded";

  const plant = input.plant.length
    ? input.plant.map((row) => `- ${row.description} x${row.quantity}`).join("\n")
    : "- none recorded";

  const photos = input.photos.length
    ? input.photos
        .map((photo) => `- [${photo.category}] ${photo.caption ?? "no caption"}`)
        .join("\n")
    : "- none";

  return [
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    input.siteAddress ? `SITE: ${input.siteAddress}` : null,
    `DATE: ${input.reportDate}`,
    input.weather ? `WEATHER: ${input.weather}` : null,
    input.authorName ? `REPORTED BY: ${input.authorName}` : null,
    "",
    "WORKFORCE ON SITE:",
    workforce,
    "",
    "PLANT AND EQUIPMENT:",
    plant,
    "",
    "PHOTOGRAPHS TAKEN:",
    photos,
    "",
    "THE SITE MANAGER'S OWN WORDS (verbatim, may be dictated and unpunctuated):",
    input.rawNotes,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const SYSTEM_PROMPT = [
  "You write daily progress reports for UK construction sites.",
  "",
  "You are given a site manager's own words, plus structured facts recorded on",
  "site. Turn them into the report sections requested, in British English.",
  "",
  "RULES, in order of importance:",
  "",
  "1. Never invent anything. Every statement must be traceable to the notes or",
  "   the structured facts. Do not add plausible detail, do not guess at",
  "   quantities, trades, times or causes, and do not resolve an ambiguity by",
  "   picking the likely reading.",
  "2. Leave a section as an empty string when the notes do not support it. An",
  "   empty section is correct and expected. Padding it is a serious error.",
  "3. This is a contractual record that may be read in a dispute about delay or",
  "   defect. Stay factual and neutral. Do not praise, apologise, or",
  "   characterise anybody's performance.",
  "4. Keep the site manager's meaning exactly, while fixing grammar and",
  "   punctuation. Keep trade terms, materials and place names as written -",
  "   they are usually right even when they look like typos.",
  "5. Write plain sentences or short bullet lines. No headings, no markdown, no",
  "   preamble such as 'Here is'. Just the section text.",
].join("\n");

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
    REPORT_SECTIONS.map((section) => [
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
            required: REPORT_SECTIONS.map((section) => section.type),
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
