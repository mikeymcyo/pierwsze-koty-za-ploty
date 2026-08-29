"use server";

import { requireSessionContext } from "@/lib/auth/session";
import { defaultDirectory } from "@/lib/stores/catalogue";
import { searchStores, type ResolvedStore } from "@/lib/stores/directory";

/**
 * Searching the store directory from a form, without shipping it.
 *
 * The directory is about 150 KB and lives on the server. A picker inside the
 * project form needs to search it without navigating away and losing what has
 * been typed, so it asks for a handful of matches at a time rather than
 * downloading the lot to filter locally.
 *
 * Behind the session like every other action, though it reads nothing
 * belonging to a company: the directory is client reference data and carries
 * no project, report, issue, photo or document.
 */
export async function findStores(text: string): Promise<ResolvedStore[]> {
  await requireSessionContext();
  const query = text.trim();
  if (query.length < 1) return [];
  const { stores } = defaultDirectory();
  // Eight is what fits under a form field on a phone without becoming a page
  // of its own. Somebody who cannot see their store in eight should type more.
  return searchStores(stores, { text: query }, 8);
}
