import "server-only";

import sharp from "sharp";

import { aiClient, aiModel } from "@/lib/ai/provider";

import {
  PHOTO_DESCRIPTION_SYSTEM_PROMPT,
  buildPhotoDescriptionPrompt,
  type PhotoDescriptionInput,
} from "@/lib/ai/photo-prompt";
import { describeAiFailure } from "@/lib/ai/failure";

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
  aiModel("vision");

export async function describePhotograph(
  image: { data: Buffer; mimeType: string },
  context: PhotoDescriptionInput,
): Promise<PhotoDescriptionResult> {
  const client = aiClient();
  if (!client) return { ok: false, error: "AI drafting is not configured on this deployment." };

  // Only a requested description needs this small copy. Keep the original in storage.
  let jpeg: Buffer;
  try {
    const source = sharp(image.data, { limitInputPixels: 90_000_000 });
    const { format } = await source.metadata();
    if (!format || !["jpeg", "png", "webp", "gif", "heif", "avif", "tiff"].includes(format)) {
      throw new Error("Unsupported photograph format");
    }
    jpeg = await source.rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, error: "AI could not read this image. Add a JPEG or PNG copy to get a suggestion, or type a caption for the original." };
  }
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  try {
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
      error: describeAiFailure(
        cause,
        "The AI service could not be reached. Your photograph and caption are untouched - try again shortly.",
      ),
    };
  }
}
