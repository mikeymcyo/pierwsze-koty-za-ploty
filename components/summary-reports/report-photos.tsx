"use client";

import { useActionState, useState } from "react";
import { ImageOff, Images, Plus, X } from "lucide-react";
import { useFormStatus } from "react-dom";

import { PhotoDetails } from "@/components/reports/photo-details";
import { PhotoUpload } from "@/components/reports/photo-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  linkSummaryPhotos,
  removeSummaryPhoto,
  type SummaryPhotoState,
} from "@/app/(app)/summary-reports/photo-actions";
import { photoReference } from "@/lib/pdf/photo-evidence";
import { PHOTO_CATEGORY_LABELS } from "@/lib/photos";
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
 * the document.
 */
export function ReportPhotos({
  reportId,
  companyId,
  projectId,
  photos,
  available,
  aiConfigured,
}: {
  reportId: string;
  companyId: string;
  projectId: string;
  /** Already in this report, in the order they will print. */
  photos: ReportPhoto[];
  /** On the project but not in this report yet. */
  available: ReportPhoto[];
  aiConfigured: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const add = linkSummaryPhotos.bind(null, reportId);
  const [addState, addAction] = useActionState<SummaryPhotoState, FormData>(add, {});

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
            ? "Take or choose photographs here. They are added to this report straight away."
            : `${photos.length} ${photos.length === 1 ? "photograph" : "photographs"} in this report, printed as ${photoReference(0)}${
                photos.length > 1 ? ` to ${photoReference(photos.length - 1)}` : ""
              }.`}
        </p>
      </div>

      <PhotoUpload
        companyId={companyId}
        projectId={projectId}
        reportId={null}
        summaryReportId={reportId}
        defaultCategory="before"
      />

      {photos.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-surface-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums text-ink">
                    {photoReference(index)}
                  </span>
                  <span className="text-xs font-medium text-ink-muted">
                    {PHOTO_CATEGORY_LABELS[photo.category]}
                  </span>
                </span>
                <RemovePhoto reportId={reportId} photoId={photo.id} />
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

              {/* The same caption and AI description used everywhere else. */}
              <PhotoDetails
                photoId={photo.id}
                caption={photo.caption}
                category={photo.category}
                aiConfigured={aiConfigured}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {available.length > 0 ? (
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
                    {PHOTO_CATEGORY_LABELS[photo.category]}
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
