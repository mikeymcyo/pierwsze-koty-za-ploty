"use client";

import { useActionState, useState } from "react";
import { ImageOff, Images, Plus, X } from "lucide-react";
import { useFormStatus } from "react-dom";

import { PhotoDetails } from "@/components/reports/photo-details";
import {
  PhotoOrderArrows,
  PhotoOrderBar,
  PhotoOrderHint,
  usePhotoOrder,
} from "@/components/reports/photo-reorder";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  linkSummaryPhotos,
  removeSummaryPhoto,
  reorderSummaryPhotos,
  type SummaryPhotoState,
} from "@/app/(app)/summary-reports/photo-actions";
import { photoReference } from "@/lib/pdf/photo-evidence";
import { UNSET_PHOTO_STATUS, photoPickerLabel, photoStatusLabel } from "@/lib/photo-captions";
import type { PhotoCategory } from "@/types/database";

export type ReportPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  category: PhotoCategory;
};

/**
 * The photographs in this report, taken and captioned without leaving it.
 *
 * The whole point is that a survey is written on site: the camera button is
 * here, a photograph taken from here is part of this document the moment it is
 * taken, and the caption box is under the picture rather than behind a trip to
 * the project's own photo tab and back.
 *
 * Nothing underneath is new. The upload is the application's own uploader
 * writing to the same private bucket under the same company folder, the
 * caption and AI description are the same PhotoDetails used everywhere else,
 * and the link is the `summary_report_photos` row the PDF already reads. The
 * plate references match what will be printed, so P03 on the screen is P03 in
 * the document - and Reorder is the same control a Daily Report uses, from
 * components/reports/photo-reorder.tsx, writing the link's own sort_order.
 *
 * With `manage` off it is the ordering half alone: the list, the plate
 * references and the arrows, with no camera and no remove. That is what a
 * report consolidating issued Daily Reports needs, because it chooses its
 * photographs by ticking them in the curation form and then has to be able to
 * say what order they print in.
 */
export function ReportPhotos({
  reportId,
  companyId,
  projectId,
  photos,
  available,
  aiConfigured,
  defaultCategory = UNSET_PHOTO_STATUS,
  manage = true,
}: {
  reportId: string;
  companyId: string;
  projectId: string;
  /** Already in this report, in the order they will print. */
  photos: ReportPhoto[];
  /** On the project but not in this report yet. Unused when `manage` is off. */
  available: ReportPhoto[];
  aiConfigured: boolean;
  /**
   * What the status menu starts on. Nothing, unless the caller has a reason: a
   * survey records what is there before anybody has worked, so it starts on
   * Before. A Progress Report written directly has no such reason.
   */
  defaultCategory?: PhotoCategory;
  /**
   * Whether photographs are taken, captioned and removed here. False on a
   * report that curates them in its own form, which still has to be able to
   * put them in order.
   */
  manage?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [reordering, setReordering] = useState(false);
  const add = linkSummaryPhotos.bind(null, reportId);
  const [addState, addAction] = useActionState<SummaryPhotoState, FormData>(add, {});

  const order = usePhotoOrder(
    photos.map((photo) => photo.id),
    (ids) => reorderSummaryPhotos(reportId, ids),
  );
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ordered = order.ids.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        {/* An h3: this sits inside the document's "Photos & Evidence" section
            rather than beside it. */}
        <h3 className="text-sm font-bold tracking-wide text-ink-muted uppercase">
          Photographic evidence
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {photos.length === 0
            ? manage
              ? "Take or choose photographs here. They are added to this report straight away."
              : "Tick photographs in the form below to include them."
            : `${photos.length} ${photos.length === 1 ? "photograph" : "photographs"} in this report, printed as ${photoReference(0)}${
                photos.length > 1 ? ` to ${photoReference(photos.length - 1)}` : ""
              }.`}
        </p>
      </div>

      {manage ? (
        <PhotoUpload
          companyId={companyId}
          projectId={projectId}
          reportId={null}
          summaryReportId={reportId}
          defaultCategory={defaultCategory}
        />
      ) : null}

      {photos.length > 1 ? (
        <PhotoOrderBar
          reordering={reordering}
          onToggle={() => setReordering((open) => !open)}
          order={order}
        />
      ) : null}

      {reordering ? <PhotoOrderHint /> : null}

      {photos.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {ordered.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-surface-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums text-ink">
                    {photoReference(index)}
                  </span>
                  {photoStatusLabel(photo.category) ? (
                    <span className="text-xs font-medium text-ink-muted">
                      {photoStatusLabel(photo.category)}
                    </span>
                  ) : null}
                </span>
                {manage && !reordering ? (
                  <RemovePhoto reportId={reportId} photoId={photo.id} />
                ) : null}
              </div>

              <div className="aspect-4/3 overflow-hidden rounded-lg bg-surface-muted">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.caption ?? "Site photograph"}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center">
                    <ImageOff className="size-6 text-ink-subtle" aria-hidden />
                  </span>
                )}
              </div>

              {reordering ? (
                <PhotoOrderArrows
                  index={index}
                  count={ordered.length}
                  onMove={(direction) => order.move(photo.id, direction)}
                  caption={photo.caption}
                />
              ) : manage ? (
                /* The same caption and AI description used everywhere else. */
                <PhotoDetails
                  photoId={photo.id}
                  caption={photo.caption}
                  category={photo.category}
                  aiConfigured={aiConfigured}
                />
              ) : photo.caption ? (
                <p className="truncate text-xs text-ink-muted">{photo.caption}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {manage && available.length > 0 ? (
        picking ? (
          <form action={addAction} className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <p className="text-sm font-semibold text-ink">
              Photographs already on this project
            </p>
            {addState.error ? <Alert tone="danger">{addState.error}</Alert> : null}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {available.map((photo) => (
                <label
                  key={photo.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border border-line p-1"
                >
                  <span className="aspect-square overflow-hidden rounded bg-surface-muted">
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.caption ?? "Project photograph"}
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink">
                    <input
                      type="checkbox"
                      name="photoId"
                      value={photo.id}
                      className="size-4 accent-brand"
                    />
                    {photoPickerLabel(photo, "Photograph")}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setPicking(false)}>
                Cancel
              </Button>
              <AddButton />
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            <Images aria-hidden />
            Add from project photographs ({available.length})
          </Button>
        )
      ) : null}
    </section>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <Plus aria-hidden />
      {pending ? "Adding…" : "Add to report"}
    </Button>
  );
}

/**
 * Takes one photograph out of this report.
 *
 * Only the link goes: the photograph stays on the project with its caption and
 * its file. Removing it from a document is not a reason to destroy evidence.
 */
function RemovePhoto({ reportId, photoId }: { reportId: string; photoId: string }) {
  const remove = removeSummaryPhoto.bind(null, reportId);
  const [state, action] = useActionState<SummaryPhotoState, FormData>(remove, {});
  return (
    <form action={action}>
      <input type="hidden" name="photoId" value={photoId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        aria-label="Remove this photograph from the report"
      >
        <X aria-hidden />
        Remove
      </Button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
