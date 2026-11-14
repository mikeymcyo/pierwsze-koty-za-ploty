/**
 * The three ways a photo can reach the app, and the exact input attributes
 * each one needs.
 *
 * Shared by the uploader and its tests, so it carries no "use client"
 * directive - a value exported from a client module cannot be read on the
 * server, and these are plain data. See F10 in HANDOFF.md.
 *
 * ## Why three inputs rather than one
 *
 * A single `<input type="file" accept="image/*" capture="environment">` sends
 * an iPhone straight to the camera with no way back: there is no gesture that
 * reaches the photo library from it. That is wrong for a site manager who
 * shot the job this morning and is writing the report this afternoon.
 *
 * Dropping `capture` instead makes every tap open iOS's own sheet, so the
 * quick "photo of this, now" case costs two taps and a decision.
 *
 * So each source gets its own input with fixed attributes, and the buttons
 * name the choice in the app rather than leaving it to the sheet. Mutating
 * one input's attributes between clicks would be racier and no cheaper -
 * Safari reads `capture` when the picker opens, not when React commits.
 *
 * ## What iOS actually does with these
 *
 * Only `capture` is a hard instruction. `capture="environment"` opens the
 * rear camera directly. Without it Safari shows its own sheet - Photo Library
 * / Take Photo / Choose File - so the library and files buttons land the user
 * one tap from what they asked for rather than at the camera. Android and
 * desktop honour the same attributes with their own pickers.
 */

/** Extensions accepted when a file's MIME type is missing or useless. */
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"] as const;

export type PhotoSourceId = "camera" | "library" | "files";

export type PhotoSource = {
  id: PhotoSourceId;
  /** Written the way iOS words it, so the button and the sheet agree. */
  label: string;
  /** One line under the button, for a manager who has not met this screen before. */
  hint: string;
  accept: string;
  /** Omitted entirely on anything but the camera - present-but-empty still means "capture". */
  capture?: "environment";
  multiple: boolean;
};

export const PHOTO_SOURCES: readonly PhotoSource[] = [
  {
    id: "camera",
    label: "Take Photo",
    hint: "Opens the camera straight away.",
    accept: "image/*",
    capture: "environment",
    // The camera returns one shot at a time; `multiple` would promise
    // otherwise. Tap it again for the next one.
    multiple: false,
  },
  {
    id: "library",
    label: "Choose from Photo Library",
    hint: "Pick several at once from today's photos.",
    accept: "image/*",
    multiple: true,
  },
  {
    id: "files",
    // Files exported from another app often arrive with no usable MIME type,
    // so the extensions are listed as well as image/* - otherwise iOS greys
    // out a perfectly good HEIC. isSupportedImageFile is what actually keeps
    // a PDF out of the bucket.
    label: "Choose File",
    hint: "From iCloud Drive, Dropbox or anywhere in Files.",
    accept: `image/*,${IMAGE_EXTENSIONS.join(",")}`,
    multiple: true,
  },
] as const;

export function photoSource(id: PhotoSourceId): PhotoSource {
  const source = PHOTO_SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Unknown photo source: ${id}`);
  return source;
}

/**
 * Whether a chosen file is something the uploader can actually handle.
 *
 * `accept` is a filter on the picker, not a guarantee: the Files browser lets
 * a determined tap through, and a "Choose File" pick can arrive with an empty
 * or generic MIME type. Everything downstream - the canvas resize, the JPEG
 * re-encode, the thumbnail grid - assumes an image, so anything else is
 * refused here with a message rather than uploaded and rendered as a broken
 * tile.
 */
export function isSupportedImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("image/")) return true;

  // An unknown type is judged on its extension rather than refused outright:
  // iOS hands over HEIC as application/octet-stream often enough to matter.
  if (file.type === "" || file.type === "application/octet-stream") {
    const name = file.name.toLowerCase();
    return IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
  }

  return false;
}
