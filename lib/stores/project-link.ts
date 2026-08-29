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
