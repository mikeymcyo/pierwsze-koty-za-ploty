"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { replacePhoto } from "@/app/(app)/reports/photo-actions";
import { compress } from "@/components/reports/photo-upload";
import { Button } from "@/components/ui/button";
import { PHOTO_BUCKET, thumbnailPath } from "@/lib/photos";
import { isSupportedImageFile } from "@/lib/photo-sources";
import { createClient } from "@/lib/supabase/client";

/**
 * Replaces the image of a photograph that is already in the report.
 *
 * For the photograph edited afterwards in the phone's own Photos app - an
 * arrow, a circle, a word on it - and brought back. The photograph keeps
 * everything that makes it part of the report: its place, its caption, its
 * status, what links to it. Only the picture changes.
 *
 * The new image goes up exactly as a new photograph would - the same
 * compression, the same thumbnail beside it - under a fresh name, and only
 * then is the photograph moved onto it (see replacePhoto). Until that
 * succeeds the old image stays on the screen and in the report. If the
 * server says no, the new files are taken back out of storage; if the
 * answer never arrives, they are left alone, because the move may have
 * happened and a stray file is better than a photograph with no picture.
 */
export function PhotoReplace({
  photoId,
  storagePath,
  onClose,
}: {
  photoId: string;
  /** The image the photograph shows now; the new one goes in the same folder. */
  storagePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replaceWith(file: File) {
    if (!isSupportedImageFile(file)) {
      setError("That file is not a photo.");
      return;
    }
    setBusy(true);
    setError(null);

    const folder = storagePath.slice(0, storagePath.lastIndexOf("/") + 1);
    const path = `${folder}${crypto.randomUUID()}.jpg`;
    const supabase = createClient();
    let uploaded = false;

    try {
      const { blob, width, height, thumb } = await compress(file);
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      uploaded = true;

      // Beside the photograph and never in front of it, as on a new upload.
      if (thumb) {
        await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(thumbnailPath(path), thumb, { contentType: "image/jpeg", upsert: false })
          .catch(() => undefined);
      }

      const result = await replacePhoto(photoId, {
        storagePath: path,
        width: width || null,
        height: height || null,
      });
      if (result.error) {
        // The server did not move the photograph: the new files are nobody's.
        await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([path, thumbnailPath(path)])
          .catch(() => undefined);
        setError(result.error);
        setBusy(false);
        return;
      }

      router.refresh();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed";
      setError(
        uploaded
          ? "The server could not be reached. If the new photo does not appear, try again."
          : `The new photo could not be uploaded (${message}). The original is unchanged.`,
      );
      setBusy(false);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3 ring-1 ring-line/60 ring-inset">
      <p className="text-sm text-ink">
        Replace this photo? Caption, status and report details will be kept.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-photo-replace-input
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void replaceWith(file);
        }}
      />
      {busy ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Replacing…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => input.current?.click()}>
            Choose photo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
