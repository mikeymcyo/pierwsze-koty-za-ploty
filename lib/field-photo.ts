import { commitFieldPart } from "@/lib/field-commit";
import { attachPhoto } from "@/app/(app)/reports/photo-actions";
import { attachSummaryPhoto } from "@/app/(app)/summary-reports/photo-actions";
import { createClient } from "@/lib/supabase/client";
import { UNSET_PHOTO_STATUS } from "@/lib/photo-captions";
import { PHOTO_BUCKET, photoPathPrefix, thumbnailPath } from "@/lib/photos";
import { JPEG_QUALITY, THUMB_EDGE, THUMB_QUALITY, downscaleSteps, targetSize } from "@/lib/photo-quality";
import type { PendingUpload } from "@/lib/pending-site-photos";

export type Compressed = { blob: Blob; width: number; height: number; thumb: Blob | null };

/**
 * Re-encodes a photo to a sensible size before upload, and makes the small
 * copy the screens will use.
 *
 * The sizes and the quality are decided in lib/photo-quality.ts, which is
 * where the reasoning lives. This function is only the canvas work: step down
 * through the chain of sizes with the browser's best resampling, encode the
 * photograph, then carry on down the same chain to the thumbnail and encode
 * that. One decode, one chain, two files.
 *
 * The orientation is asked for explicitly. It is the default in every current
 * browser, but a photograph whose EXIF orientation is dropped comes out on its
 * side in the PDF, and that is not something to leave to a default.
 *
 * Falls back to the original file when anything about the canvas path fails -
 * a large upload is much better than a lost photo, and the bucket enforces its
 * own 15 MB ceiling anyway. A thumbnail is a convenience and never evidence,
 * so a missing one is null rather than a failure; the route that serves them
 * falls back to the photograph itself.
 */
export async function compress(file: Blob): Promise<Compressed> {
  const original: Compressed = { blob: file, width: 0, height: 0, thumb: null };

  let close = () => {};
  try {
    // Safari can decode some camera/library images in <img> that its bitmap decoder rejects.
    const bitmap = typeof createImageBitmap === "function"
      ? await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null)
      : null;
    let image: CanvasImageSource;
    let source: { width: number; height: number };
    if (bitmap) {
      close = () => bitmap.close();
      image = bitmap;
      source = { width: bitmap.width, height: bitmap.height };
    } else {
      const url = URL.createObjectURL(file);
      close = () => URL.revokeObjectURL(url);
      const element = new Image();
      element.src = url;
      await element.decode();
      image = element;
      source = { width: element.naturalWidth, height: element.naturalHeight };
    }
    const target = targetSize(source);

    let drawn: CanvasImageSource = image;
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
      return { ...original, width: source.width, height: source.height };
    }

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
  } finally {
    close();
  }
}

type Destination = { companyId: string; projectId: string; reportId: string | null; summaryReportId?: string | null; fieldCapture?: boolean };

export function originalPhoto(file: Blob, id: string, companyId: string, projectId: string): PendingUpload {
  return {
    id, original: true, blob: file, name: file instanceof File ? file.name : "Site photograph",
    category: UNSET_PHOTO_STATUS, path: `${photoPathPrefix(companyId, projectId)}${id}.jpg`,
    width: 0, height: 0, thumb: null,
  };
}

export function uploadFieldPhoto({ file, id, ...destination }: Destination & { file: Blob; id: string }) {
  return uploadPendingPhoto(originalPhoto(file, id, destination.companyId, destination.projectId), { ...destination, fieldCapture: true });
}

export async function uploadPendingPhoto(photo: PendingUpload, destination: Destination): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      uploadAndAttach(photo, destination),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The upload timed out. Retry when you have signal.")), 75000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function uploadAndAttach(photo: PendingUpload, { projectId, reportId, summaryReportId, fieldCapture }: Destination) {
  // Existing drafts already contain a compressed photo and thumbnail.
  const item = photo.original ? { ...photo, ...await compress(photo.blob) } : photo;
  const bucket = createClient().storage.from(PHOTO_BUCKET);
  const { error } = await bucket.upload(item.path, item.blob, {
    contentType: item.blob.type || "image/jpeg",
    upsert: false,
  });
  // A previous attempt can finish writing even after its response times out.
  // Continue to the attachment for an existing object at this capture's immutable path.
  if (error && !["Duplicate", "ResourceAlreadyExists", "KeyAlreadyExists"].includes(error.name)
      && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
  if (item.thumb) {
    // Thumbnails are optional. The gallery falls back to the full photo; a slow
    // thumbnail must never hold up attachment or acknowledgement of the original.
    void bucket.upload(thumbnailPath(item.path), item.thumb, { contentType: "image/jpeg" }).catch(() => {});
  }

  const metadata = {
    storagePath: item.path, caption: null, category: item.category,
    width: item.width || null, height: item.height || null,
  };
  if (fieldCapture && reportId) {
    const result = await commitFieldPart({ kind: "photo", photo: { ...metadata, projectId, reportId } });
    if (!result.ok) throw new Error("The report did not confirm the photo. Retry upload.");
    return;
  }
  const result = summaryReportId
    ? await attachSummaryPhoto({ ...metadata, summaryReportId })
    : await attachPhoto({ ...metadata, projectId, reportId });
  if (result?.error) throw new Error(result.error);
}
