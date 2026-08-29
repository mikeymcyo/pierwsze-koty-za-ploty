import { ImageOff, Trash2 } from "lucide-react";

import { deletePhoto } from "@/app/(app)/reports/photo-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoDetails } from "@/components/reports/photo-details";
import { photoPrintLabel, photoPrintLabelText } from "@/lib/photo-captions";
import type { Photo } from "@/types/database";

export type PhotoWithUrl = Pick<
  Photo,
  "id" | "caption" | "category" | "storage_path" | "width" | "height"
> & { url: string | null };

/**
 * Photos as a thumbnail grid.
 *
 * Two columns on a phone: big enough to tell one pour of concrete from another
 * with the screen at arm's length in daylight, which one column of full-width
 * images would scroll forever and three would make too small.
 */
export function PhotoGrid({
  photos,
  deletable = true,
  editable = deletable,
  aiConfigured = false,
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
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id} className="flex flex-col gap-2">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-muted">
            {photo.url ? (
              // Signed Supabase URLs expire, so next/image's optimiser would
              // cache a URL that outlives it and then serve broken images.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.url}
                alt={photoPrintLabelText(photo) ?? "Site photo"}
                className="size-full object-cover"
                loading="lazy"
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
                  aria-label={`Delete photo${photoPrintLabelText(photo) ? `: ${photoPrintLabelText(photo)}` : ""}`}
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
              {photoPrintLabel(photo).status ? (
                <Badge tone="neutral">{photoPrintLabel(photo).status}</Badge>
              ) : null}
              {photoPrintLabel(photo).caption ? (
                <p className="text-xs text-ink-muted">{photoPrintLabel(photo).caption}</p>
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
