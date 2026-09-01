import "server-only";

import OpenAI from "openai";

import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  type ExtractionPromptInput,
} from "@/lib/ai/extraction-prompt";
import {
  EXTRACTION_JSON_SCHEMA,
  parseExtraction,
  type DocumentPage,
  type VerifiedExtraction,
} from "@/lib/documents/extraction-schema";

/**
 * Reads one document and returns what it says, checked.
 *
 * The model never gets the last word. Whatever comes back goes through
 * parseExtraction, which throws away every item whose quote is not in the text
 * the model was given - so a fabricated order number cannot reach the caller,
 * let alone the job context every other AI layer reads.
 *
 * Writes nothing. The caller owns the extraction row and its lifecycle; this
 * function owns the call and the check.
 */

export const EXTRACTION_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.5";

export function hasExtractionConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export type ExtractionCallResult =
  | {
      ok: true;
      extraction: VerifiedExtraction;
      model: string;
      promptVersion: string;
      /**
       * What the model actually returned, before the check.
       *
       * Carried so a failure can be diagnosed against the reply that caused
       * it rather than guessed at: "which item was dropped, and was it right
       * to drop it" is unanswerable from the verified content alone. Nothing
       * stores it - the caller keeps the checked content and the source text,
       * which is what a person needs to see.
       */
      raw: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export async function extractFromDocument(
  input: ExtractionPromptInput,
  pages: DocumentPage[],
): Promise<ExtractionCallResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI reading is not configured on this deployment." };

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: buildExtractionPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_extraction",
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned nothing. Try again." };

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, error: "The model's reply was not readable." };
    }

    // The check, not a formality. Everything downstream trusts this.
    const checked = parseExtraction(raw, pages);
    if (!checked.ok) return { ok: false, error: checked.error, raw };

    return {
      ok: true,
      extraction: checked.extraction,
      model: EXTRACTION_MODEL,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      raw,
    };
  } catch (cause) {
    console.error("[siteboss] document extraction failed:", cause);
    return {
      ok: false,
      error:
        cause instanceof Error && /api key|401|invalid/i.test(cause.message)
          ? "The AI key was rejected. Check OPENAI_API_KEY."
          : "The AI service could not be reached. The document is untouched - try again shortly.",
    };
  }
}
