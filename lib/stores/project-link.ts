/**
 * What a store fills in on a project, and what it deliberately does not.
 *
 * Pure, with no runtime imports and no path aliases.
 *
 * A store is a place. A project is one package of works at that place, and the
 * same store may carry several over the years - a hoarding replacement, then a
 * roof repair, then planned maintenance. So selecting a store fills in the
 * things that belong to the place and leaves alone the things that belong to
 * the job.
 *
 * In particular the store number is NOT written into the project reference.
 * They are different numbers that happen to look alike: the store number is
 * the client's permanent name for the building, and the project reference is
 * this contractor's name for this job. Copying one into the other would make
 * two jobs at the same store indistinguishable, and would be almost impossible
 * to unpick later.
 */

export type StoreProjectDefaults = {
  client: string;
  site_address: string | null;
  postcode: string | null;
};

/** The project fields a selected store can fill in on its own. */
export function storeProjectDefaults(store: {
  client: string;
  address: string | null;
  postcode: string | null;
}): StoreProjectDefaults {
  return {
    client: store.client,
    site_address: store.address,
    postcode: store.postcode,
  };
}

/**
 * Starting a project at a store.
 *
 * The store is named by directory and number rather than by copying its fields
 * into the address bar: the page looks it up, so a link cannot carry an
 * address that disagrees with the directory.
 */
export function newProjectHref(store: { directoryId: string; code: string }): string {
  const params = new URLSearchParams({
    directory: store.directoryId,
    store: store.code,
  });
  return `/projects/new?${params}`;
}

// ---------------------------------------------------------------------------
// The link, as the database holds it
// ---------------------------------------------------------------------------

/** The pair a project stores. Both present, or neither. */
export type StoreLink = { directory: string; code: string };

/**
 * The link on a project, or null.
 *
 * Half a link is treated as none. The database refuses to store one, but a row
 * read from anywhere else should not be able to produce a lookup that cannot
 * resolve.
 */
export function storeLinkOf(project: {
  location_directory?: string | null;
  location_code?: string | null;
}): StoreLink | null {
  const directory = project.location_directory?.trim();
  const code = project.location_code?.trim();
  return directory && code ? { directory, code } : null;
}

/**
 * A link from what a form submitted, or null where nothing was selected.
 *
 * Returns `invalid` rather than throwing, so the caller can say so in the same
 * way it says anything else about a form.
 */
export function parseStoreLink(
  directory: string | null | undefined,
  code: string | null | undefined,
): { ok: true; link: StoreLink | null } | { ok: false } {
  const d = (directory ?? "").trim();
  const c = (code ?? "").trim();
  if (!d && !c) return { ok: true, link: null };
  if (!d || !c) return { ok: false };
  if (d.length > 40 || c.length > 32) return { ok: false };
  return { ok: true, link: { directory: d, code: c } };
}

/** What a project row records for a selected store, or for none. */
export function storeColumns(link: StoreLink | null): {
  location_directory: string | null;
  location_code: string | null;
} {
  return {
    location_directory: link?.directory ?? null,
    location_code: link?.code ?? null,
  };
}

/** One line naming the place, for a report or a heading. */
export function storeLabel(store: { displayName: string; displayCode: string }): string {
  return `${store.displayName} · Store ${store.displayCode}`;
}

export const STORE_NOT_FOUND =
  "That store is not in the directory. Search for it again, or leave the store blank.";
