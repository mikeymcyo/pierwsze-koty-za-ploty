/**
 * Shared by server actions, server components and the browser uploader, so it
 * carries no "use client" directive - a value exported from a client module
 * cannot be called on the server.
 */

export const PHOTO_BUCKET = "site-photos";

/** Signed thumbnail URLs are re-minted on every render; this only has to outlive one page view. */
export const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * Storage policies match the leading folder against the caller's company, so
 * every object path must begin "{company_id}/{project_id}/".
 */
export function photoPathPrefix(companyId: string, projectId: string): string {
  return `${companyId}/${projectId}/`;
}

/**
 * The status menu and its labels live in lib/photo-captions.ts, next to the
 * rule about what actually gets printed. Re-exported here because this is
 * where callers have always looked for them.
 */
export { PHOTO_STATUSES as PHOTO_CATEGORIES, PHOTO_STATUS_LABELS as PHOTO_CATEGORY_LABELS } from "@/lib/photo-captions";
