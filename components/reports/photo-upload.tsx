"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen, Images, Loader2, RotateCw } from "lucide-react";
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
 * One photograph on its way to the bucket.
 *
 * The path is minted when the file is chosen and never again, which is what
 * makes a retry write the same object instead of a second one.
 */
type PendingUpload = {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  path: string;
};

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
  /**
   * Photographs that did not make it.
   *
   * The compressed bytes are kept, and so is the storage path minted when the
   * file was chosen - not a fresh one per attempt. That is what makes a retry
   * safe: it writes the same object again rather than a second copy, and
   * attachPhoto refuses to insert a second row for a path it already has. So
   * pressing Retry twice on one bar of signal cannot leave two of the same
   * photograph in the report.
   */
  const [failed, setFailed] = useState<PendingUpload[]>([]);

  // A photograph half-way to the bucket is work in progress. Leaving the page
  // now loses it, so the browser asks first - the one thing that can be done
  // about it without an offline queue.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

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

    // Compressed and given its storage path here, once, before any attempt.
    // Every retry of this photograph then writes the same object.
    const pending: PendingUpload[] = [];
    for (const file of list) {
      const { blob, width, height } = await compress(file);
      pending.push({
        id: crypto.randomUUID(),
        name: file.name,
        blob,
        width,
        height,
        path: `${photoPathPrefix(companyId, projectId)}${crypto.randomUUID()}.jpg`,
      });
    }

    resetInput(source);
    await send(pending, skippedNote);
  }

  /**
   * Upload and attach, one at a time, keeping whatever failed.
   *
   * Nothing is reported as uploaded before the row exists: an object in the
   * bucket with no row is not a photograph in the report, and saying it was
   * would be the exact lie this pass exists to remove.
   */
  async function send(pending: PendingUpload[], skippedNote = "") {
    setBusy({ done: 0, total: pending.length });
    const supabase = createClient();
    const stillFailing: PendingUpload[] = [];
    let firstFailure: string | null = null;

    for (const [index, item] of pending.entries()) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(item.path, item.blob, {
            contentType: item.blob.type || "image/jpeg",
            // The same path on a retry. Upsert so an object left behind by a
            // half-finished first attempt is replaced rather than refused,
            // which is what used to turn a retry into a second photograph.
            upsert: true,
          });

        if (uploadError) throw new Error(uploadError.message);

        const result = summaryReportId
          ? await attachSummaryPhoto({
              summaryReportId,
              storagePath: item.path,
              caption: null,
              category,
              width: item.width || null,
              height: item.height || null,
            })
          : await attachPhoto({
              projectId,
              reportId,
              storagePath: item.path,
              caption: null,
              category,
              width: item.width || null,
              height: item.height || null,
            });
        if (result?.error) throw new Error(result.error);
      } catch (cause) {
        stillFailing.push(item);
        firstFailure ??= cause instanceof Error ? cause.message : "Upload failed";
      }

      setBusy({ done: index + 1, total: pending.length });
    }

    setBusy(null);
    setFailed(stillFailing);

    if (stillFailing.length) {
      setError(
        (stillFailing.length === pending.length
          ? `Nothing uploaded. ${firstFailure}`
          : `${pending.length - stillFailing.length} of ${pending.length} uploaded. ${firstFailure}`) +
          skippedNote,
      );
    } else {
      setError(skippedNote.trim() ? `Uploaded.${skippedNote}` : null);
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

      {/* Kept, not lost. The bytes are still here and the storage path is the
          one they were given when the photograph was chosen, so Try again
          writes the same object rather than a second copy of it. */}
      {failed.length > 0 && !busy ? (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-surface p-3">
          <p className="text-sm font-semibold text-ink">
            {failed.length} {failed.length === 1 ? "photograph" : "photographs"} did not upload
          </p>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {failed.map((item) => (
              <li key={item.id} className="truncate">
                {item.name || "Site photograph"}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => void send(failed)}
          >
            <RotateCw aria-hidden />
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
