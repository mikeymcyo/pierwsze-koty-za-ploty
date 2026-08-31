"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImageOff, ListOrdered, Trash2 } from "lucide-react";

import { deletePhoto, reorderReportPhotos } from "@/app/(app)/reports/photo-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoDetails } from "@/components/reports/photo-details";
import { photoPrintLabel, photoPrintLabelText } from "@/lib/photo-captions";
import { photoReference } from "@/lib/pdf/photo-evidence";
import {
  PLATES_PER_ROW,
  movePhotoEarlier,
  movePhotoLater,
  sharesRow,
} from "@/lib/photos-order";
import type { Photo } from "@/types/database";

export type PhotoWithUrl = Pick<
  Photo,
  "id" | "caption" | "category" | "storage_path" | "width" | "height"
> & { url: string | null };

/** How long a shuffle is left to settle before the order is written. */
const SAVE_DELAY_MS = 700;

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
 * will print as, so the screen and the document cannot disagree.
 *
 * Arrows rather than a drag. A long-press drag on iOS fights the page's own
 * scrolling, and a report with fifteen photographs is a lot of dragging on a
 * phone held in one hand with the other on a ladder. Two big targets move a
 * plate one place at a time and can be tapped without looking.
 *
 * Nothing here moves, copies or deletes a file. The row carries its own
 * caption, status and description wherever it goes.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The order lives here while the screen is open. Re-seeded only when the set
  // of photographs itself changes - one added or deleted - so that the
  // revalidation which follows a save does not undo the move that caused it.
  const incoming = photos.map((photo) => photo.id);
  const key = [...incoming].sort().join();
  const [order, setOrder] = useState({ key, ids: incoming });
  if (order.key !== key) setOrder({ key, ids: incoming });

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ordered = order.ids.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });

  const canReorder = Boolean(reportId) && deletable && photos.length > 1;

  function move(next: string[]) {
    setOrder((current) => ({ ...current, ids: next }));
    setSaved(false);
    setError(null);

    // Debounced: somebody moving a plate three places taps three times, and
    // that is one decision rather than three.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await reorderReportPhotos(reportId!, next);
        if (result.error) setError(result.error);
        else setSaved(true);
      });
    }, SAVE_DELAY_MS);
  }

  return (
    <div className="flex flex-col gap-3">
      {canReorder ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant={reordering ? "primary" : "secondary"}
            size="sm"
            onClick={() => setReordering((open) => !open)}
            aria-pressed={reordering}
          >
            <ListOrdered aria-hidden />
            {reordering ? "Done reordering" : "Reorder"}
          </Button>

          <span aria-live="polite" className="text-xs text-ink-muted">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : pending ? (
              "Saving order…"
            ) : saved ? (
              "Order saved"
            ) : null}
          </span>
        </div>
      ) : null}

      {reordering ? (
        <p className="text-xs text-ink-muted">
          The report prints {PLATES_PER_ROW} plates to a row in this order, so a before
          and an after placed next to each other appear side by side.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ordered.map((photo, index) => {
          const label = photoPrintLabel(photo);
          const alt = photoPrintLabelText(photo);
          const pairedWithPrevious = index > 0 && sharesRow(index - 1, index);

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
                  />
                ) : (
                  <div className="grid size-full place-items-center text-ink-subtle">
                    <ImageOff className="size-6" aria-hidden />
                  </div>
                )}

                {reordering ? (
                  <span className="absolute top-1.5 left-1.5 rounded-lg bg-ink-inverse/85 px-2 py-1 text-xs font-bold text-ink">
                    {photoReference(index)}
                  </span>
                ) : null}

                {deletable && !reordering ? (
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

              {reordering ? (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="flex-1"
                      disabled={index === 0}
                      aria-label={`Move ${photoReference(index)} earlier`}
                      onClick={() => move(movePhotoEarlier(order.ids, photo.id))}
                    >
                      <ArrowLeft aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="flex-1"
                      disabled={index === ordered.length - 1}
                      aria-label={`Move ${photoReference(index)} later`}
                      onClick={() => move(movePhotoLater(order.ids, photo.id))}
                    >
                      <ArrowRight aria-hidden />
                    </Button>
                  </div>
                  {/* Which photograph this is, where two pours of concrete look
                      the same at thumbnail size. Read-only here: reordering
                      moves the plate, it does not edit it. */}
                  {label.caption ? (
                    <span className="truncate text-[11px] text-ink-muted">{label.caption}</span>
                  ) : null}
                  {pairedWithPrevious ? (
                    <span className="text-[11px] text-ink-subtle">
                      Prints beside {photoReference(index - 1)}
                    </span>
                  ) : null}
                </div>
              ) : editable ? (
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
