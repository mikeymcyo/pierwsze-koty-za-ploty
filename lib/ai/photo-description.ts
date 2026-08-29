import "server-only";

import OpenAI from "openai";

import {
  PHOTO_DESCRIPTION_SYSTEM_PROMPT,
  buildPhotoDescriptionPrompt,
  type PhotoDescriptionInput,
} from "@/lib/ai/photo-prompt";

/**
 * Proposes a description for one photograph.
 *
 * Returns text and nothing else. It never writes to the database - the caller
 * hands the sentence to the user, who accepts, edits, regenerates or ignores
 * it. That separation is the whole safety design: a caption a person did not
 * approve never reaches a client document, and a caption they wrote themselves
 * cannot be replaced by a model that ran in the background.
 *
 * Called only when somebody presses the button. Describing every upload
 * automatically would cost money on photographs nobody prints and would fill
 * reports with captions no one has read.
 */
export type PhotoDescriptionResult =
  | { ok: true; description: string }
  | { ok: false; error: string };

/** Vision needs a model that accepts images; the text model is not assumed to. */
export const PHOTO_AI_MODEL =
  process.env.OPENAI_VISION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5.5";

export async function describePhotograph(
  image: { data: Buffer; mimeType: string },
  context: PhotoDescriptionInput,
): Promise<PhotoDescriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };

  // Sent inline rather than as a link. The bucket is private, so an external
  // fetcher has nothing to fetch, and a signed URL that expired mid-request
  // would fail in a way nobody could diagnose from the error.
  const dataUrl = `data:${image.mimeType};base64,${image.data.toString("base64")}`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: PHOTO_AI_MODEL,
      messages: [
        { role: "system", content: PHOTO_DESCRIPTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildPhotoDescriptionPrompt(context) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const description = completion.choices[0]?.message?.content?.trim();
    if (!description) return { ok: false, error: "The model returned nothing. Try again." };

    // A model asked for one sentence occasionally returns it wrapped in quotes
    // or with a leading label. Neither belongs in a client document.
    const cleaned = description
      .replace(/^["'“‘]+|["'”’]+$/g, "")
      .replace(/^(description|caption)\s*:\s*/i, "")
      .trim();
    if (!cleaned) return { ok: false, error: "The model returned nothing usable. Try again." };

    return { ok: true, description: cleaned };
  } catch (cause) {
    console.error("[siteboss] photo description failed:", cause);
    return {
      ok: false,
      error:
        cause instanceof Error && /api key|401|invalid/i.test(cause.message)
          ? "The AI key was rejected. Check OPENAI_API_KEY."
          : "The AI service could not be reached. Your photograph and caption are untouched - try again shortly.",
    };
  }
}
