/**
 * The one line under a report's title that says where it is.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * A list of reports is read on a phone, in a second, to find the one that was
 * meant - and "Daily Report 0012" on its own does not say which of forty
 * stores it belongs to. So every card carries the place, in the order a
 * client would quote it: the store, when the project is linked to one, as
 * "Tilbury · Store 2158"; otherwise the site address the project records;
 * otherwise nothing at all, rather than an empty line.
 *
 * The store label is the same shape as `storeLabel` in lib/stores/project-link.ts
 * - the town and the number the client uses - pinned together by the tests
 * rather than by an import, so this file stays free of any.
 */
export type ReportPlaceProject = {
  site_address?: string | null;
  postcode?: string | null;
};

export type ReportPlaceStore = { displayName: string; displayCode: string };

export function reportPlace(
  project: ReportPlaceProject | null | undefined,
  store: ReportPlaceStore | null,
): string | null {
  if (store) return `${store.displayName} · Store ${store.displayCode}`;

  const address = project?.site_address?.trim() || "";
  const postcode = project?.postcode?.trim() || "";
  if (!address) return postcode || null;
  // A postcode already inside the address is not written twice.
  if (!postcode || address.toLowerCase().includes(postcode.toLowerCase())) return address;
  return `${address}, ${postcode}`;
}
