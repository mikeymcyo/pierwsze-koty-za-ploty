/**
 * Recent locations: the stores a person opened or asked directions to.
 *
 * Pure, with no runtime imports and no path aliases, so the rules are tested
 * directly. The rows live in `public.recent_locations` (one per user and
 * store, `visited_at` moved forward on every visit); this module decides
 * what counts as a valid key, how many to show, and what a row is called.
 *
 * History, not a CRM. A row is two keys of shipped reference data and a
 * time. It is never shown to another user, never joined to a project, and
 * removing one changes nothing anywhere else.
 */

/** Roughly the last twenty: enough for a week of enquiries, short enough to scan. */
export const RECENT_LIMIT = 20;

/** The shape a directory id and a store code must have before anything is recorded. */
const DIRECTORY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STORE_CODE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,31}$/;

export type RecentKey = { directory: string; code: string };

/**
 * A well-formed key, or null.
 *
 * Shape only; whether the store actually exists is the caller's question,
 * answered against the shipped directory (`knownStore` below with the
 * catalogue's lookup). Nothing that fails here reaches the database.
 */
export function parseRecentKey(input: { directory?: unknown; code?: unknown }): RecentKey | null {
  const directory = typeof input.directory === "string" ? input.directory.trim() : "";
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!DIRECTORY_ID.test(directory) || !STORE_CODE.test(code)) return null;
  return { directory, code };
}

/**
 * Whether the key names a store this build ships.
 *
 * `lookup` is the catalogue's resolver; passing it in keeps this module free
 * of the 150 KB directory and lets the tests hand in a small one.
 */
export function knownStore<T>(
  key: RecentKey,
  lookup: (directory: string, code: string) => T | null,
): T | null {
  return lookup(key.directory, key.code);
}

/** "Croydon · Store 1470" - the same identity a report card prints. */
export function recentTitle(store: { displayName: string; displayCode: string }): string {
  return `${store.displayName} · Store ${store.displayCode}`;
}

/**
 * The rows to show, newest first and never more than the limit.
 *
 * Resolved against the directory by the caller; a row whose store has left
 * the shipped list resolves to nothing and is dropped rather than shown as a
 * blank card. Order is the database's, so it is repeated here only for a
 * caller that assembled rows from more than one read.
 */
export function recentRows<T extends { visitedAt: string }>(rows: readonly T[], limit = RECENT_LIMIT): T[] {
  return [...rows].sort((a, b) => (a.visitedAt < b.visitedAt ? 1 : a.visitedAt > b.visitedAt ? -1 : 0)).slice(0, limit);
}
