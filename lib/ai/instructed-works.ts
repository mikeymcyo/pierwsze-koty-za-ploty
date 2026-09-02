import "server-only";

import OpenAI from "openai";

import {
  INSTRUCTED_WORKS_JSON_SCHEMA,
  INSTRUCTED_WORKS_PROMPT_VERSION,
  INSTRUCTED_WORKS_SYSTEM_PROMPT,
  buildInstructedWorksPrompt,
  type InstructedWorksPromptInput,
} from "@/lib/ai/instructed-works-prompt";
import {
  instructedWorksSchema,
  sanitiseRows,
  type InstructedWorkRow,
} from "@/lib/summary-reports/instructed-works";

/**
 * Fills in the instructed works table.
 *
 * Whatever comes back is sanitised before the caller sees it: plate references
 * that point at no photograph are dropped, and a Complete or Partially
 * complete with nothing in the works column falls back to Not confirmed. The
 * model is told both rules; this is what makes them true.
 *
 * Writes nothing. The caller owns the section row.
 */
export type InstructedWorksResult =
  | { ok: true; rows: InstructedWorkRow[]; promptVersion: string }
  | { ok: false; error: string };

export async function generateInstructedWorks(
  input: InstructedWorksPromptInput,
  plateCount: number,
): Promise<InstructedWorksResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
      messages: [
        { role: "system", content: INSTRUCTED_WORKS_SYSTEM_PROMPT },
        { role: "user", content: buildInstructedWorksPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "instructed_works_table",
          strict: true,
          schema: INSTRUCTED_WORKS_JSON_SCHEMA,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned nothing. Try again." };

    const parsed = instructedWorksSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { ok: false, error: "The model's reply did not match the instructed works shape." };
    }

    return {
      ok: true,
      rows: sanitiseRows(parsed.data.rows, plateCount),
      promptVersion: INSTRUCTED_WORKS_PROMPT_VERSION,
    };
  } catch (cause) {
    console.error("[siteboss] instructed works generation failed:", cause);
    return {
      ok: false,
      error: "The instructed works table could not be written. The rest of the report is unaffected.",
    };
  }
}
