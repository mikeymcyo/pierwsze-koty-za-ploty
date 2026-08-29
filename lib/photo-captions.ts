/**
 * What gets printed under a photograph, and the statuses on offer when one is
 * taken.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly and imported from the browser uploader, the server actions and the
 * PDF documents alike.
 *
 * The problem this fixes: every photograph printed its category in capitals,
 * so a report of twelve site photographs said PROGRESS twelve times and told
 * the client nothing. A status is only worth printing when it says something
 * the picture does not, and a caption the site manager actually wrote always
 * says more than a category ever will.
 */

import type { PhotoCategory } from "@/types/database";

/**
 * The statuses offered when capturing. Six, because a list you scroll is a
 * list nobody sets - these are the distinctions that change what a photograph
 * proves in a dispute.
 *
 * Every value here already exists in the `photo_category` enum, so this is a
 * relabelling and a shortening of the menu, not a schema change. "During" is
 * the enum's `progress`; "Other" is its `general`.
 */
export const PHOTO_STATUSES: { value: PhotoCategory; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "progress", label: "During" },
  { value: "after", label: "After" },
  { value: "defect", label: "Defect" },
  { value: "delivery", label: "Delivery" },
  { value: "general", label: "Other" },
];

/**
 * Values that are no longer offered but are still stored on photographs taken
 * before this menu shrank. They must keep rendering their own words: an
 * existing report that said "Work completed" must not start saying "Other".
 */
export const RETIRED_PHOTO_STATUSES: { value: PhotoCategory; label: string }[] = [
  { value: "work_completed", label: "Work completed" },
  { value: "safety", label: "Safety" },
];

export const PHOTO_STATUS_LABELS: Record<PhotoCategory, string> = Object.fromEntries(
  [...PHOTO_STATUSES, ...RETIRED_PHOTO_STATUSES].map((status) => [status.value, status.label]),
) as Record<PhotoCategory, string>;

/**
 * A status that adds nothing to a photograph of a building site. Printing
 * "Other" under a picture is worse than printing nothing: it occupies the line
 * where a caption would have gone and implies a classification was made.
 */
function saysSomething(category: string): boolean {
  return category !== "general";
}

export type PrintedPhotoLabel = {
  /** The words the site manager wrote, which outrank any category. */
  caption: string | null;
  /** A short qualifier, or null when it would only be noise. */
  status: string | null;
};

/**
 * What to print beneath one photograph.
 *
 * The caption leads whenever there is one - it is the only part written by
 * somebody who was standing there. The status stays alongside it because
 * "Before" and "Defect" change what the picture means, but it drops away
 * entirely when it is `general`, which is the repetition this replaces.
 */
export function photoPrintLabel(photo: {
  caption: string | null;
  /** Widened to string: a value stored before this menu existed must not throw. */
  category: string;
}): PrintedPhotoLabel {
  const caption = photo.caption?.trim() || null;
  const status = saysSomething(photo.category)
    ? (PHOTO_STATUS_LABELS[photo.category as PhotoCategory] ?? null)
    : null;
  return { caption, status };
}

/**
 * The same thing as one string, for places with a single line to spend - a
 * thumbnail's alt text, a picker, a log line.
 */
export function photoPrintLabelText(photo: {
  caption: string | null;
  category: string;
}): string | null {
  const { caption, status } = photoPrintLabel(photo);
  if (caption && status) return `${status} - ${caption}`;
  return caption ?? status;
}
