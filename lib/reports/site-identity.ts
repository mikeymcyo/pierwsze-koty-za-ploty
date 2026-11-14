/**
 * What a report says about the place it was written at.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * without a database or a renderer.
 *
 * The chain is client, then store, then project, then reports. A project
 * linked to a store in the client's directory should not make anybody retype
 * the address on every daily report - but a project is also allowed to
 * disagree with the directory, because site paperwork is full of legitimate
 * exceptions: a compound with its own entrance, a unit address that differs
 * from the store's, a client contracting under a different name.
 *
 * So what is written on the project always wins, and the store fills the gaps.
 * That way linking a store adds information and never overrules a person.
 *
 * Nothing here reaches an issued PDF. Those are stored files written once, so a
 * report issued before a store was linked keeps saying exactly what it said.
 */

export type ReportSite = {
  client: string | null;
  siteAddress: string | null;
  /** The place in the client's own terms, or null on a project with no store. */
  store: { name: string; code: string } | null;
};

export function reportSite(
  project: {
    client?: string | null;
    site_address?: string | null;
  },
  store: {
    client: string;
    displayName: string;
    displayCode: string;
    address: string | null;
  } | null,
): ReportSite {
  const typed = (value: string | null | undefined) => value?.trim() || null;
  return {
    client: typed(project.client) ?? store?.client ?? null,
    siteAddress: typed(project.site_address) ?? store?.address ?? null,
    store: store ? { name: store.displayName, code: store.displayCode } : null,
  };
}

/** The one line a report prints for the store. */
export function storeLine(store: { name: string; code: string } | null): string | null {
  return store ? `${store.name} · ${store.code}` : null;
}
