/**
 * Shared by server actions, server components and the browser uploader, so it
 * carries no "use client" directive - a value exported from a client module
 * cannot be called on the server.
 */

export const PHOTO_BUCKET = "site-photos";

/** Signed URLs are re-minted on every render; this only has to outlive one page view. */
export const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * Storage policies match the leading folder against the caller's company, so
 * every object path must begin "{company_id}/{project_id}/".
 */
export function photoPathPrefix(companyId: string, projectId: string): string {
  return `${companyId}/${projectId}/`;
}

/**
 * Where the small copy of a photograph lives.
 *
 * Beside the original rather than under a folder of its own, because the
 * storage policies match the leading "{company_id}/" segment and nothing else:
 * a sibling object is covered by exactly the same rules as the photograph it
 * belongs to, with no policy to add and no way for the two to drift apart.
 */
export function thumbnailPath(storagePath: string): string {
  return `${storagePath.replace(/\.[^./]+$/, "")}.thumb.jpg`;
}

/**
 * The URL a screen uses to show a photograph.
 *
 * Deliberately our own origin and deliberately stable. A Supabase signed URL
 * carries a token that changes every time it is minted, so the same photograph
 * on the same screen was a fresh URL on every render and the browser cache
 * never once hit - every navigation re-downloaded every photograph in full.
 * This path never changes, and the route behind it says the bytes may be kept.
 */
export function photoThumbUrl(photoId: string): string {
  return `/photos/${photoId}/thumb`;
}

/**
 * The status menu and its labels live in lib/photo-captions.ts, next to the
 * rule about what actually gets printed. Re-exported here because this is
 * where callers have always looked for them.
 */
export { PHOTO_STATUSES as PHOTO_CATEGORIES, PHOTO_STATUS_LABELS as PHOTO_CATEGORY_LABELS } from "@/lib/photo-captions";
