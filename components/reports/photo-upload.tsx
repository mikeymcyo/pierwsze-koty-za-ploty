"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { attachPhoto } from "@/app/(app)/reports/photo-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET, PHOTO_CATEGORIES, photoPathPrefix } from "@/lib/photos";
import type { PhotoCategory } from "@/types/database";

/**
 * The longest edge a stored photo is allowed to have.
 *
 * A modern phone camera produces 4000px, 6 MB files. Site photos are looked at
 * on a phone and printed into a PDF at a few inches wide, so that detail is
 * never seen - it only costs upload time on a site with one bar of signal, and
 * counts against a free-tier storage quota. 1600px still prints cleanly.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type Compressed = { blob: Blob; width: number; height: number };

/**
 * Re-encodes a photo to a sensible size before upload.
 *
 * Falls back to the original file when anything about the canvas path fails -
 * a large upload is much better than a lost photo, and the bucket enforces its
 * own 15 MB ceiling anyway.
 */
async function compress(file: File): Promise<Compressed> {
  const original: Compressed = { blob: file, width: 0, height: 0 };

  if (typeof createImageBitmap !== "function") return original;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return { ...original, width: bitmap.width, height: bitmap.height };

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    return blob ? { blob, width, height } : { ...original, width, height };
  } catch {
    return original;
  }
}

export function PhotoUpload({
  companyId,
  projectId,
  reportId,
}: {
  companyId: string;
  projectId: string;
  reportId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PhotoCategory>("progress");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setError(null);
    setBusy({ done: 0, total: list.length });

    const supabase = createClient();
    const failures: string[] = [];

    for (const [index, file] of list.entries()) {
      try {
        const { blob, width, height } = await compress(file);
        const name = `${crypto.randomUUID()}.jpg`;
        const path = `${photoPathPrefix(companyId, projectId)}${name}`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });

        if (uploadError) {
          failures.push(uploadError.message);
        } else {
          const result = await attachPhoto({
            projectId,
            reportId,
            storagePath: path,
            caption: null,
            category,
            width: width || null,
            height: height || null,
          });
          if (result?.error) failures.push(result.error);
        }
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : "Upload failed");
      }

      setBusy({ done: index + 1, total: list.length });
    }

    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";

    if (failures.length) {
      setError(
        failures.length === list.length
          ? `Nothing uploaded. ${failures[0]}`
          : `${list.length - failures.length} of ${list.length} uploaded. ${failures[0]}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-col gap-2">
          <Label htmlFor="photo-category">Tag these as</Label>
          <Select
            id="photo-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as PhotoCategory)}
          >
            {PHOTO_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={() => inputRef.current?.click()}
          loading={busy !== null}
          disabled={busy !== null}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {busy ? `Uploading ${busy.done} of ${busy.total}…` : "Add photos"}
        </Button>
      </div>

      {/*
        capture="environment" asks a phone for the rear camera directly, while
        still allowing the gallery. It is a hint: desktops ignore it and show a
        file picker, which is what we want there.
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
