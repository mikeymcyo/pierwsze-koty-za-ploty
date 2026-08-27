/**
 * Shared by server actions, server components and the browser uploader, so it
 * carries no "use client" directive - a value exported from a client module
 * cannot be called on the server.
 */

import type { PhotoCategory } from "@/types/database";

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

export const PHOTO_CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "work_completed", label: "Work completed" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "defect", label: "Defect" },
  { value: "safety", label: "Safety" },
  { value: "delivery", label: "Delivery" },
  { value: "general", label: "General" },
];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = Object.fromEntries(
  PHOTO_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<PhotoCategory, string>;
