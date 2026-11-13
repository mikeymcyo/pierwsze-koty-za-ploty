"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen, Images, Loader2, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { originalPhoto, uploadPendingPhoto } from "@/lib/field-photo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { UNSET_PHOTO_STATUS } from "@/lib/photo-captions";
import { keepPendingPhoto, pendingPhotos, removePendingPhoto, type PendingUpload } from "@/lib/pending-site-photos";
import { remainingPhotoRetries } from "@/lib/photo-retries";
import { PHOTO_CATEGORIES } from "@/lib/photos";
import {
  PHOTO_SOURCES,
  isSupportedImageFile,
  type PhotoSourceId,
} from "@/lib/photo-sources";
import type { PhotoCategory } from "@/types/database";

/** Kept beside the source table rather than in it, so lib/photo-sources.ts stays server-safe. */
const SOURCE_ICONS: Record<PhotoSourceId, LucideIcon> = {
  camera: Camera,
  library: Images,
  files: FolderOpen,
};

export { compress } from "@/lib/field-photo";

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
  captureUserId,
  defaultCategory = UNSET_PHOTO_STATUS,
  simple = false,
}: {
  companyId: string;
  projectId: string;
  reportId: string | null;
  summaryReportId?: string | null;
  /** Site Capture offers the camera and a multi-select library input without a status menu. */
  simple?: boolean;
  captureUserId?: string;
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
  const [failed, setFailed] = useState<PendingUpload[]>([]);
  const scope = captureUserId && reportId ? [captureUserId, companyId, projectId, reportId].join(":") : null;
  const [storageWarning, setStorageWarning] = useState(false);
  const seen = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const uploads = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!scope) return;
    let active = true;
    pendingPhotos(scope)
      .then(photos => {
        if (!active) return;
        const restored = photos.filter(photo => !seen.current.has(photo.id));
        setFailed(previous => remainingPhotoRetries(previous, restored, restored));
      })
      .catch(() => { if (active) setStorageWarning(true); });
    return () => { active = false; };
  }, [scope]);

  // Warn while uploads or unsaved in-memory photos still need attention.
  useEffect(() => {
    if (!busy && !failed.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, failed.length]);

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

    const pending = list.map(file => ({
      ...originalPhoto(file, crypto.randomUUID(), companyId, projectId),
      category,
    }));
    resetInput(source);
    setError(null);
    for (const item of pending) seen.current.add(item.id);

    // Start saving all originals immediately, including the rest of a library
    // selection. Decoding or waiting on the network can outlive the page.
    if (scope) {
      await Promise.all(pending.map(item =>
        keepPendingPhoto(scope, item).catch(() => setStorageWarning(true)),
      ));
    }
    await send(pending, skippedNote);
  }

  async function send(selection: PendingUpload[], skippedNote = "") {
    const pending = selection.filter(photo => !inFlight.current.has(photo.id));
    if (!pending.length) return;
    for (const item of pending) inFlight.current.add(item.id);
    setBusy(previous => ({ done: previous?.done ?? 0, total: (previous?.total ?? 0) + pending.length }));

    // Serialise decodes to keep iPhone memory bounded. The pickers remain
    // available while earlier photos are queued, and new originals are saved immediately.
    const run = async () => {
      const stillFailing: PendingUpload[] = [];
      let firstFailure: string | null = null;
      for (const item of pending) {
        try {
          await uploadPendingPhoto(item, { companyId, projectId, reportId, summaryReportId });
          if (scope) await removePendingPhoto(scope, item.id).catch(() => setStorageWarning(true));
        } catch (cause) {
          stillFailing.push(item);
          firstFailure ??= cause instanceof Error ? cause.message : "Upload failed.";
        } finally {
          inFlight.current.delete(item.id);
          setBusy(previous => previous && previous.done + 1 < previous.total
            ? { ...previous, done: previous.done + 1 }
            : null);
        }
      }
      setFailed(previous => remainingPhotoRetries(previous, pending, stillFailing));
      if (firstFailure) setError(`Photo upload failed. ${firstFailure}${skippedNote}`);
      else setError(skippedNote.trim() || null);
    };
    uploads.current = uploads.current.then(run, run);
    await uploads.current;
  }

  // Clearing the value is what lets the same photo be chosen twice running -
  // without it the second pick fires no change event.
  function resetInput(source: PhotoSourceId) {
    const input = inputRefs.current.get(source);
    if (input) input.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      {simple ? null : (
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
      )}

      <div className={simple ? "grid grid-cols-2 gap-2" : "grid gap-2 sm:grid-cols-3"}>
        {PHOTO_SOURCES.map((source) => {
          if (simple && source.id === "files") return null;
          const Icon = SOURCE_ICONS[source.id];

          return (
            <div key={source.id} className="flex flex-col gap-1">
              <Button
                type="button"
                size="lg"
                variant={source.id === "camera" ? "primary" : "secondary"}
                className="w-full justify-start text-left text-base sm:justify-center sm:text-center"
                onClick={() => inputRefs.current.get(source.id)?.click()}
                data-photo-source-button={source.id}
              >
                <Icon aria-hidden />
                {simple && source.id === "library" ? "Photo library" : source.label}
              </Button>
              {simple ? null : <p className="text-xs text-ink-muted">{source.hint}</p>}

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

      {storageWarning ? <Alert tone="danger">Phone storage is unavailable. Keep your originals and stay on this screen until uploads finish.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* Kept, not lost. The bytes are still here and the storage path is the
          one they were given when the photograph was chosen, so Try again
          writes the same object rather than a second copy of it. */}
      {failed.length > 0 && !busy ? (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-surface p-3">
          <p className="text-sm font-semibold text-ink">
            {failed.length} {failed.length === 1 ? "photograph needs" : "photographs need"} another upload attempt
          </p>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            {failed.map((item) => (
              <li key={item.id} className="truncate">
                {item.name || "Site photograph"}
                {storageWarning ? <button type="button" className="ml-2 underline" onClick={() => {
                  const url = URL.createObjectURL(item.blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = item.name || "site-photo";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                }}>Save a copy</button> : null}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            {scope && !storageWarning ? "Saved on this device. Reopen this report or retry when you have signal." : "Keep this screen open and retry when you have signal."}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => void send(failed)}
          >
            <RotateCw aria-hidden />
            Retry upload
          </Button>
        </div>
      ) : null}
    </div>
  );
}
