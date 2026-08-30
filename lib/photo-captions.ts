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
 *
 * The same fault came back through the other door. Printing was fixed but
 * capture was not: every upload was tagged "During" unless somebody changed
 * the menu, so twenty-five ordinary site photographs arrived carrying
 * twenty-five DURING labels that nobody had chosen. **A status is now
 * something a person opts into.** New photographs are taken with no status at
 * all, and a status appears - on screen and in the PDF - only where one was
 * deliberately picked.
 *
 * "No status" needs no new enum value: `general` has always been the value
 * that prints nothing, so it is now named for what it does. Nothing already
 * stored changes meaning, and no migration is involved.
 */

import type { PhotoCategory } from "@/types/database";

/**
 * What a photograph can be marked as, with "No status" first because it is the
 * answer for most photographs and the one a new upload starts on.
 *
 * The other five are the distinctions that change what a photograph proves in
 * a dispute. A list you scroll is a list nobody sets, so there are no more.
 *
 * Every value here already exists in the `photo_category` enum, so this is a
 * relabelling and a shortening of the menu, not a schema change. "During" is
 * the enum's `progress`; "No status" is its `general`, which has always been
 * the value that prints nothing.
 */
export const UNSET_PHOTO_STATUS: PhotoCategory = "general";

export const PHOTO_STATUSES: { value: PhotoCategory; label: string }[] = [
  { value: UNSET_PHOTO_STATUS, label: "No status" },
  { value: "before", label: "Before" },
  { value: "progress", label: "During" },
  { value: "after", label: "After" },
  { value: "defect", label: "Defect" },
  { value: "delivery", label: "Delivery" },
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
 * Whether a stored value is a status somebody chose.
 *
 * `general` is not: it is what a photograph carries when nobody marked it.
 * Printing a word there is worse than printing nothing - it occupies the line
 * where a caption would have gone and implies a classification was made.
 */
function saysSomething(category: string): boolean {
  return category !== UNSET_PHOTO_STATUS;
}

/**
 * The status to show, hand to a model, or put in a picker - and null where
 * nobody chose one.
 *
 * Everything that displays a status goes through this or through
 * photoPrintLabel, so an unmarked photograph is unmarked everywhere: the grid,
 * the pickers, the AI's context and the PDF alike.
 */
export function photoStatusLabel(category: string): string | null {
  return saysSomething(category)
    ? (PHOTO_STATUS_LABELS[category as PhotoCategory] ?? null)
    : null;
}

/**
 * A one-line name for a photograph in a picker or a list, with something to
 * fall back on when it has neither caption nor status.
 */
export function photoPickerLabel(
  photo: { caption: string | null; category: string },
  fallback: string,
): string {
  return photoPrintLabelText(photo) ?? fallback;
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
  return { caption, status: photoStatusLabel(photo.category) };
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
