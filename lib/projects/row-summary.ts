/**
 * What a project card says at a glance.
 *
 * Pure, with no runtime imports and no path aliases.
 *
 * A card in a list is read in a second while walking, so it carries the four
 * things that tell somebody whether this is the project they meant - what it
 * is, who it is for, where it is, and whether anything is outstanding - and
 * nothing else. Everything absent is dropped rather than printed as a dash: a
 * card of empty labels is harder to scan than a short one.
 */

export type ProjectRowData = {
  name: string;
  client: string | null;
  site_address: string | null;
  project_reference: string | null;
};

/**
 * The line under the name: who it is for and where.
 *
 * The store, when there is one, replaces the address rather than joining it -
 * they say the same thing, and the store number is the more useful of the two
 * because it is what the client quotes.
 */
export function projectSubtitle(
  project: ProjectRowData,
  store: { displayName: string; displayCode: string } | null,
): string | null {
  const parts = [
    project.client?.trim() || null,
    store ? `${store.displayName} · ${store.displayCode}` : project.site_address?.trim() || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "3 open issues", or nothing at all when there are none to mention. */
export function openIssueLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 open issue" : `${count} open issues`;
}

/** Counts open and in-progress issues per project from one flat query. */
export function tallyOpenIssues(
  rows: readonly { project_id: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
  }
  return counts;
}
