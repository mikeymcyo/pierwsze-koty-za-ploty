"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, FolderOpen, Images, Loader2, RotateCw, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { UNSET_PHOTO_STATUS } from "@/lib/photo-captions";
import {
  KEEP_OPEN_NOTICE,
  UPLOAD_STATE_LABELS,
  countPending,
  notSecuredLabel,
  securedLabel,
  securingLabel,
  summariseQueue,
  targetKey,
  type QueuedPhoto,
} from "@/lib/photo-queue";
import { uploadNow } from "@/components/photos/photo-queue-runner";
import {
  forgetUploaded,
  getQueueSnapshot,
  getServerQueueSnapshot,
  markDraining,
  recordsFor,
  registerVisibleTarget,
  removeQueued,
  retryQueued,
  securePhotos,
  subscribeToQueue,
} from "@/lib/photo-queue-store";
import { PHOTO_CATEGORIES, photoPathPrefix } from "@/lib/photos";
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

/**
 * What this screen has just done with a selection. The live states of the
 * photographs themselves come from the queue, not from here.
 */
type Phase =
  | { kind: "securing"; count: number }
  | { kind: "secured"; count: number }
  | { kind: "unsecured"; count: number; reason: string | null };

/**
 * The queue records for one selection.
 *
 * Each photograph is given its storage path here, once, before any attempt.
 * Every upload of it, however many, writes the same object and attaches the
 * same path, which is what lets the server refuse a second row for a
 * photograph it already has. The original bytes go with it; compression
 * happens at upload, from them, every time.
 *
 * The bytes are read into memory here, before securing, and a fresh Blob is
 * made from them. A File from the picker - and any slice of it - is only a
 * reference to a temporary file on the phone, and on an iPhone IndexedDB
 * kept that reference rather than the bytes: once iOS had cleared the
 * picker's copy, every read of the "secured" photograph failed, quietly, for
 * days. A Blob built from an ArrayBuffer is the bytes themselves and is
 * stored as such. Seven photographs are read in well under a second.
 */
async function queueRecords(
  files: File[],
  where: {
    companyId: string;
    projectId: string;
    reportId: string | null;
    summaryReportId: string | null;
    category: PhotoCategory;
  },
): Promise<QueuedPhoto[]> {
  const now = Date.now();
  const copies = await Promise.all(
    files.map(async (file) => new Blob([await file.arrayBuffer()], { type: file.type })),
  );
  return files.map((file, index) => ({
    id: crypto.randomUUID(),
    companyId: where.companyId,
    projectId: where.projectId,
    reportId: where.reportId,
    summaryReportId: where.summaryReportId,
    category: where.category,
    path: `${photoPathPrefix(where.companyId, where.projectId)}${crypto.randomUUID()}.jpg`,
    name: file.name,
    type: file.type || "image/jpeg",
    file: copies[index]!,
    status: "queued",
    attempts: 0,
    lastError: null,
    nextAttemptAt: 0,
    createdAt: now + index,
    secured: false,
  }));
}

/**
 * Adds photos to a report, to a survey, or to the project itself.
 *
 * ## Secure first, then upload
 *
 * The moment the picker returns, every chosen photograph is written to the
 * phone's own database with the storage path it will always be uploaded to -
 * before it is compressed, before a byte goes over the air. "Securing 25
 * photos…" is on the screen while that write runs, and "25 photos secured"
 * only once it has committed. From then on the photographs belong to the
 * queue (lib/photo-queue.ts): the runner in the app shell uploads them one at
 * a time whenever SiteBoss is open, and this control only shows their state.
 * Leaving the screen, refreshing it, backgrounding the app, or having iOS
 * discard the page changes nothing about what is on the phone.
 *
 * A phone that will not keep the bytes - no local database, a full one - is
 * told so in as many words. Its photographs are still uploaded, from memory,
 * for as long as this screen is open; they just cannot be promised past it.
 *
 * ## What the words mean
 *
 * Uploading, Waiting for signal, Uploaded, Failed - and nothing else.
 * Uploaded is said only after the server has confirmed the row. A failure
 * that is the network's is Waiting for signal and retries itself; one that is
 * the server's - an issued report, a refused file - is Failed and waits for a
 * person to Retry or Remove it. Removing is asked for twice, because it
 * discards evidence that was secured on the phone.
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
  simple = false,
}: {
  companyId: string;
  projectId: string;
  reportId: string | null;
  summaryReportId?: string | null;
  /**
   * One button, "Add photos", and nothing else.
   *
   * For Site Capture, where a new operative has to know what to press with no
   * explanation. The single input carries no `capture`, which is exactly what
   * makes iOS show its own sheet - Take Photo, Photo Library, Choose File -
   * so every source is still one tap away; the app just stops naming them.
   * No status menu either: a status is chosen on the report, if at all.
   */
  simple?: boolean;
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
  const router = useRouter();
  const [category, setCategory] = useState<PhotoCategory>(defaultCategory);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const target = targetKey({ reportId, summaryReportId, projectId });
  const snap = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getServerQueueSnapshot);
  const mine = recordsFor(snap.records, target);
  const uploaded = snap.uploaded.filter((entry) => entry.target === target);
  const failed = mine.filter((record) => record.status === "failed");
  const unsecured = mine.filter((record) => !record.secured);
  const pending = countPending(mine);
  const summary = summariseQueue(mine, snap.online, snap.draining);

  // This screen shows its own list, so the app-wide chip need not count these.
  useEffect(() => registerVisibleTarget(target), [target]);

  // The Uploaded rows have said their piece once nothing of this screen's is
  // still on its way; the grid above holds the photographs themselves now.
  useEffect(() => {
    if (pending > 0 || uploaded.length === 0) return;
    const timer = setTimeout(() => forgetUploaded(target), 6_000);
    return () => clearTimeout(timer);
  }, [pending, uploaded.length, target]);

  // "25 photos secured · uploading…" becomes "25 photos uploaded" only once
  // every one of them has a row - and never while one is still failed, since
  // a failed photograph is still one of this screen's records.
  const batchDone =
    phase !== null &&
    (phase.kind === "secured" || phase.kind === "unsecured") &&
    snap.loaded &&
    mine.length === 0;

  async function handleFiles(source: PhotoSourceId, files: FileList) {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;

    // A picker's `accept` is a filter, not a promise. Anything that is not an
    // image is dropped here, before it can occupy a tile that will never load.
    const list = chosen.filter(isSupportedImageFile);
    const skipped = chosen.length - list.length;
    const skippedNote =
      skipped > 0
        ? `${skipped} ${skipped === 1 ? "file was" : "files were"} not a photo and ${
            skipped === 1 ? "was" : "were"
          } skipped.`
        : null;
    setNote(skippedNote);

    if (list.length === 0) {
      setNote(`Nothing uploaded. ${skippedNote ?? ""}`.trim());
      resetInput(source);
      return;
    }

    setPhase({ kind: "securing", count: list.length });

    // Claimed for this screen before the copy is even written, so the shell's
    // runner does not take the same photographs off the database first.
    markDraining(true);
    const records = await queueRecords(list, { companyId, projectId, reportId, summaryReportId, category });
    const { secured, reason } = await securePhotos(records);
    setPhase(
      secured
        ? { kind: "secured", count: list.length }
        : { kind: "unsecured", count: list.length, reason },
    );

    // Cleared only now: the picked files stay readable until the phone has
    // its own copy of them.
    resetInput(source);

    // Uploaded from memory, now. The database copy is the safety net for a
    // page that dies before this finishes; the runner picks up from it.
    void uploadNow(records, (uploaded) => {
      if (uploaded > 0) router.refresh();
    });
  }

  // Clearing the value is what lets the same photo be chosen twice running -
  // without it the second pick fires no change event.
  function resetInput(source: PhotoSourceId) {
    const input = inputRefs.current.get(source);
    if (input) input.value = "";
  }

  const securing = phase?.kind === "securing";
  const simpleSource = PHOTO_SOURCES.find((source) => source.id === "files")!;

  return (
    <div className="flex flex-col gap-3">
      {simple ? (
        <>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="w-full text-base"
            onClick={() => inputRefs.current.get("files")?.click()}
            disabled={securing}
            data-photo-source-button="simple"
          >
            <Camera aria-hidden />
            Add photos
          </Button>
          <input
            ref={(node) => {
              inputRefs.current.set("files", node);
            }}
            type="file"
            accept={simpleSource.accept}
            multiple={simpleSource.multiple}
            data-photo-source="simple"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              if (event.target.files) void handleFiles("files", event.target.files);
            }}
          />
        </>
      ) : null}
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

      {/*
        Three buttons rather than one: on a phone the choice between the camera
        and the library is the whole interaction, and it is made before the
        picker opens rather than inside someone else's sheet. (Site Capture is
        the exception, above.)
      */}
      {simple ? null : (
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
                disabled={securing}
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
      )}

      {/* What just happened to the selection: securing, secured, or not. */}
      {phase?.kind === "securing" ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {securingLabel(phase.count)}
        </p>
      ) : null}
      {phase?.kind === "secured" && !batchDone ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Check className="size-4 text-success" aria-hidden />
          {securedLabel(phase.count)}
        </p>
      ) : null}
      {batchDone ? (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Check className="size-4 text-success" aria-hidden />
          {phase.count} {phase.count === 1 ? "photo" : "photos"} uploaded.
        </p>
      ) : null}
      {unsecured.length > 0 || phase?.kind === "unsecured" ? (
        <Alert tone="danger">
          {notSecuredLabel(
            unsecured.length || (phase?.kind === "unsecured" ? phase.count : 0),
            phase?.kind === "unsecured" ? phase.reason : null,
          )}
        </Alert>
      ) : null}
      {note ? <Alert tone="info">{note}</Alert> : null}

      {/* The live state of this screen's photographs, from the queue. */}
      {summary ? (
        <div className="flex flex-col gap-2" data-photo-queue-status={summary.state}>
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
            {summary.state === "uploading" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {summary.text}
          </p>
          {pending > 0 ? <p className="text-xs text-ink-muted">{KEEP_OPEN_NOTICE}</p> : null}
        </div>
      ) : null}

      {uploaded.length > 0 || failed.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {uploaded.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 text-xs text-ink-muted"
              data-photo-queue-row="uploaded"
            >
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="truncate">{entry.name || "Site photograph"}</span>
              <span className="ml-auto shrink-0 font-semibold">{UPLOAD_STATE_LABELS.uploaded}</span>
            </li>
          ))}
          {failed.map((record) => (
            <FailedRow key={record.id} record={record} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A photograph the server refused. Its bytes are still on the phone.
 *
 * Retry puts it back in the queue as it was. Remove discards the secured copy,
 * which is the one thing on this screen that loses evidence, so it is asked
 * for twice through the same inline confirmation every other destructive
 * action uses.
 */
function FailedRow({ record }: { record: QueuedPhoto }) {
  return (
    <li
      className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-surface p-3"
      data-photo-queue-row="failed"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="truncate font-semibold text-ink">{record.name || "Site photograph"}</span>
        <span className="ml-auto shrink-0 text-xs font-semibold text-danger">
          {UPLOAD_STATE_LABELS.failed}
        </span>
      </div>
      {record.lastError ? <p className="text-xs text-ink-muted">{record.lastError}</p> : null}
      <div className="flex flex-wrap items-start gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void retryQueued(record.id)}
        >
          <RotateCw aria-hidden />
          Retry
        </Button>
        <ConfirmAction
          action={async () => {
            await removeQueued(record.id);
          }}
          trigger="Remove"
          triggerIcon={<Trash2 aria-hidden />}
          title="Remove this photo?"
          description="It has not been uploaded. Removing it discards the copy secured on this phone, and it cannot be got back."
          confirmLabel="Remove photo"
          pendingLabel="Removing…"
        />
      </div>
    </li>
  );
}
