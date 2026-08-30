"use client";

import { useRef, useState } from "react";
import { Camera, FolderOpen, Images, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { attachPhoto } from "@/app/(app)/reports/photo-actions";
import { attachSummaryPhoto } from "@/app/(app)/summary-reports/photo-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { UNSET_PHOTO_STATUS } from "@/lib/photo-captions";
import { PHOTO_BUCKET, PHOTO_CATEGORIES, photoPathPrefix } from "@/lib/photos";
import {
  PHOTO_SOURCES,
  isSupportedImageFile,
  type PhotoSourceId,
} from "@/lib/photo-sources";
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

/** Kept beside the source table rather than in it, so lib/photo-sources.ts stays server-safe. */
const SOURCE_ICONS: Record<PhotoSourceId, LucideIcon> = {
  camera: Camera,
  library: Images,
  files: FolderOpen,
};

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

/**
 * Adds photos to a report, to a survey, or to the project itself.
 *
 * `reportId` is null on the project's Photos tab. The photos table allows it -
 * report_id is nullable and documented as "photos captured against the project
 * outside of any report" - and its RLS is company-scoped, not report-scoped,
 * so nothing about the security model changes between the callers.
 *
 * `summaryReportId` is the survey or consolidated report a photograph should
 * join the moment it is taken. Everything above this line is identical either
 * way: the same bucket, the same company folder, the same compression, the
 * same validation. Only the row that records where it belongs differs.
 */
export function PhotoUpload({
  companyId,
  projectId,
  reportId,
  summaryReportId = null,
  defaultCategory = UNSET_PHOTO_STATUS,
}: {
  companyId: string;
  projectId: string;
  reportId: string | null;
  summaryReportId?: string | null;
  /**
   * What the menu starts on. No status, unless the caller has a reason - a
   * survey documents what is there now, so it starts on Before. Twenty-five
   * ordinary site photographs should not arrive carrying twenty-five labels
   * nobody chose.
   */
  defaultCategory?: PhotoCategory;
}) {
  // One ref per source: the attributes that decide what iOS opens are fixed on
  // each input rather than swapped on the shared one before a click.
  const inputRefs = useRef(new Map<PhotoSourceId, HTMLInputElement | null>());
  const [category, setCategory] = useState<PhotoCategory>(defaultCategory);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(source: PhotoSourceId, files: FileList) {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    // A picker's `accept` is a filter, not a promise. Anything that is not an
    // image is dropped here, before it can occupy a tile that will never load.
    const list = chosen.filter(isSupportedImageFile);
    const skipped = chosen.length - list.length;
    const skippedNote =
      skipped > 0
        ? ` ${skipped} ${skipped === 1 ? "file was" : "files were"} not a photo and ${
            skipped === 1 ? "was" : "were"
          } skipped.`
        : "";

    if (list.length === 0) {
      setError(`Nothing uploaded.${skippedNote}`.trim());
      resetInput(source);
      return;
    }

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
          const result = summaryReportId
            ? await attachSummaryPhoto({
                summaryReportId,
                storagePath: path,
                caption: null,
                category,
                width: width || null,
                height: height || null,
              })
            : await attachPhoto({
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
    resetInput(source);

    if (failures.length) {
      setError(
        (failures.length === list.length
          ? `Nothing uploaded. ${failures[0]}`
          : `${list.length - failures.length} of ${list.length} uploaded. ${failures[0]}`) +
          skippedNote,
      );
    } else if (skipped > 0) {
      setError(
        `${list.length} ${list.length === 1 ? "photo" : "photos"} uploaded.${skippedNote}`,
      );
    }
  }

  // Clearing the value is what lets the same photo be chosen twice running -
  // without it the second pick fires no change event.
  function resetInput(source: PhotoSourceId) {
    const input = inputRefs.current.get(source);
    if (input) input.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-40 max-w-xs flex-col gap-2">
        <Label htmlFor="photo-category">Status (optional)</Label>
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

      {/*
        Three buttons rather than one: on a phone the choice between the camera
        and the library is the whole interaction, and it is made before the
        picker opens rather than inside someone else's sheet.
      */}
      <div className="grid gap-2 sm:grid-cols-3">
        {PHOTO_SOURCES.map((source) => {
          const Icon = SOURCE_ICONS[source.id];

          return (
            <div key={source.id} className="flex flex-col gap-1">
              <Button
                type="button"
                size="lg"
                variant={source.id === "camera" ? "primary" : "secondary"}
                className="w-full justify-start text-left text-base sm:justify-center sm:text-center"
                onClick={() => inputRefs.current.get(source.id)?.click()}
                disabled={busy !== null}
                data-photo-source-button={source.id}
              >
                <Icon aria-hidden />
                {source.label}
              </Button>
              <p className="text-xs text-ink-muted">{source.hint}</p>

              {/*
                Fixed attributes, one input per source. Hidden from assistive
                technology because the button above is the real control and
                carries its name.
              */}
              <input
                ref={(node) => {
                  inputRefs.current.set(source.id, node);
                }}
                type="file"
                accept={source.accept}
                {...(source.capture ? { capture: source.capture } : {})}
                multiple={source.multiple}
                data-photo-source={source.id}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  if (event.target.files) void handleFiles(source.id, event.target.files);
                }}
              />
            </div>
          );
        })}
      </div>

      {busy ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Uploading {busy.done} of {busy.total}…
        </p>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
