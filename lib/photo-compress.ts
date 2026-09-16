/**
 * Re-encodes a photograph to a sensible size before upload, and makes the
 * small copy the screens will use. Browser-only: this is canvas work.
 *
 * The sizes and the quality are decided in lib/photo-quality.ts, which is
 * where the reasoning lives. This function is only the canvas: step down
 * through the chain of sizes with the browser's best resampling, encode the
 * photograph, then carry on down the same chain to the thumbnail and encode
 * that. One decode, one chain, two files.
 *
 * It runs at upload time, from the original bytes the queue holds, and runs
 * again on every retry. Compression is deterministic and costs well under a
 * second, so storing its output as well as its input would buy nothing and
 * double what the phone has to keep.
 *
 * The orientation is asked for explicitly. It is the default in every current
 * browser, but a photograph whose EXIF orientation is dropped comes out on its
 * side in the PDF, and that is not something to leave to a default.
 *
 * Falls back to the original when anything about the canvas path fails - a
 * large upload is much better than a lost photo, and the bucket enforces its
 * own 15 MB ceiling anyway. A thumbnail is a convenience and never evidence,
 * so a missing one is null rather than a failure; the route that serves them
 * falls back to the photograph itself.
 */

import {
  JPEG_QUALITY,
  THUMB_EDGE,
  THUMB_QUALITY,
  downscaleSteps,
  targetSize,
} from "@/lib/photo-quality";
import type { CompressedPhoto } from "@/lib/photo-queue-runner";

export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const original: CompressedPhoto = { blob: file, width: 0, height: 0, thumb: null };

  if (typeof createImageBitmap !== "function") return original;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const source = { width: bitmap.width, height: bitmap.height };
    const target = targetSize(source);

    let drawn: CanvasImageSource = bitmap;
    let canvas: HTMLCanvasElement | null = null;

    function stepDown(from: { width: number; height: number }, to: { width: number; height: number }) {
      for (const step of downscaleSteps(from, to)) {
        const next = document.createElement("canvas");
        next.width = step.width;
        next.height = step.height;

        const context = next.getContext("2d");
        if (!context) return false;

        // Without this a 4032px photograph is point-sampled down to 1600 and
        // every fine detail in it is thrown away before the encoder ever runs.
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(drawn, 0, 0, step.width, step.height);

        drawn = next;
        canvas = next;
      }
      return true;
    }

    if (!stepDown(source, target)) {
      bitmap.close();
      return { ...original, width: source.width, height: source.height };
    }

    bitmap.close();
    if (!canvas) return { ...original, ...target };

    const encode = (from: HTMLCanvasElement, quality: number) =>
      new Promise<Blob | null>((resolve) => from.toBlob(resolve, "image/jpeg", quality));

    const blob = await encode(canvas, JPEG_QUALITY);

    // The thumbnail continues down the same chain rather than starting again
    // from the bitmap, so it is resampled just as gently and costs one more
    // pair of draws rather than a second decode. A photograph already smaller
    // than a tile gets none: it would be no smaller, and the route serves the
    // photograph itself when there is nothing beside it.
    const thumbTarget = targetSize(target, THUMB_EDGE);
    const worthIt = thumbTarget.width < target.width || thumbTarget.height < target.height;
    const thumb =
      worthIt && stepDown(target, thumbTarget) && canvas
        ? await encode(canvas, THUMB_QUALITY)
        : null;

    return blob ? { blob, ...target, thumb } : { ...original, ...target, thumb };
  } catch {
    return original;
  }
}
