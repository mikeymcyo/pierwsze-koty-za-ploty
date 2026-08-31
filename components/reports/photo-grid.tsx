"use client";

import { useState } from "react";
import { ImageOff, Trash2 } from "lucide-react";

import { deletePhoto, reorderReportPhotos } from "@/app/(app)/reports/photo-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoDetails } from "@/components/reports/photo-details";
import { PhotoOrderBar, usePhotoOrder } from "@/components/reports/photo-reorder";
import { PhotoArrangeView } from "@/components/reports/photo-arrange";
import { photoPrintLabel, photoPrintLabelText } from "@/lib/photo-captions";
import { cssRotation } from "@/lib/photos-rotation";
import type { Photo } from "@/types/database";

export type PhotoWithUrl = Pick<
  Photo,
  "id" | "caption" | "category" | "storage_path" | "width" | "height"
> & { url: string | null; rotation?: number | null };

/**
 * Photos as a thumbnail grid.
 *
 * Two columns on a phone: big enough to tell one pour of concrete from another
 * with the screen at arm's length in daylight, which one column of full-width
 * images would scroll forever and three would make too small.
 *
 * ## Putting them in order
 *
 * The order is part of what the report says. Plates are numbered from their
 * position - P01, P02, P03 - and the PDF prints two to a row, so a before and
 * an after that sit next to each other here read as a pair in the document and
 * the same two photographs three plates apart read as two unrelated pictures.
 * Until now that order was whatever the upload queue happened to produce.
 *
 * Reordering is a mode rather than something always underfoot: a grid whose
 * tiles carry arrows all the time is a grid you nudge by accident while
 * scrolling one-handed. Inside the mode each tile shows the plate number it
 * will print as, so the screen and the document cannot disagree. The control
 * itself is components/reports/photo-reorder.tsx - the same one a Progress,
 * Completion or Survey report uses.
 */
export function PhotoGrid({
  photos,
  deletable = true,
  editable = deletable,
  aiConfigured = false,
  reportId = null,
}: {
  photos: PhotoWithUrl[];
  deletable?: boolean;
  /** Whether the AI description button is offered - hidden with no key configured. */
  aiConfigured?: boolean;
  /**
   * Captions and statuses are editable wherever photographs can be deleted -
   * that is, anywhere the owning report is still a draft. An issued report's
   * captions are frozen along with its PDF.
   */
  editable?: boolean;
  /**
   * The report these photographs are printed in, where there is one. A
   * project's own photographs are not in a document, so there is no order to
   * choose for them.
   */
  reportId?: string | null;
}) {
  const [reordering, setReordering] = useState(false);
  const order = usePhotoOrder(
    photos.map((photo) => photo.id),
    (ids) => reorderReportPhotos(reportId!, ids),
  );

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ordered = order.ids.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });

  const canReorder = Boolean(reportId) && deletable && photos.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {canReorder ? (
        <PhotoOrderBar
          reordering={reordering}
          onToggle={() => setReordering((open) => !open)}
          order={order}
        />
      ) : null}

      {reordering && canReorder ? (
        <PhotoArrangeView
          photos={ordered}
          order={order}
          onDone={() => setReordering(false)}
        />
      ) : null}

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ordered.map((photo) => {
          const label = photoPrintLabel(photo);
          const alt = photoPrintLabelText(photo);

          return (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-muted">
                {photo.url ? (
                  // Signed Supabase URLs expire, so next/image's optimiser would
                  // cache a URL that outlives it and then serve broken images.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={alt ?? "Site photo"}
                    className="size-full object-cover"
                    loading="lazy"
                    // Presentation only: the stored file is never altered.
                    style={
                      cssRotation(photo.rotation)
                        ? { transform: cssRotation(photo.rotation) }
                        : undefined
                    }
                  />
                ) : (
                  <div className="grid size-full place-items-center text-ink-subtle">
                    <ImageOff className="size-6" aria-hidden />
                  </div>
                )}

                {deletable ? (
                  <form
                    action={deletePhoto}
                    className="absolute top-1.5 right-1.5 opacity-90"
                  >
                    <input type="hidden" name="photoId" value={photo.id} />
                    <Button
                      type="submit"
                      variant="danger"
                      size="icon"
                      aria-label={`Delete photo${alt ? `: ${alt}` : ""}`}
                      className="size-9 rounded-lg"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </form>
                ) : null}
              </div>

              {editable ? (
                <PhotoDetails
                  photoId={photo.id}
                  caption={photo.caption}
                  category={photo.category}
                  aiConfigured={aiConfigured}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  {label.status ? <Badge tone="neutral">{label.status}</Badge> : null}
                  {label.caption ? (
                    <p className="text-xs text-ink-muted">{label.caption}</p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
