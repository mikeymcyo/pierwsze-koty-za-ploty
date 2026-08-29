/**
 * Getting to the store.
 *
 * Pure, with no runtime imports and no path aliases.
 *
 * A plain Google Maps directions link, which is what the standalone locator
 * used and what works: no API key, no billing account, nothing to expire, and
 * nothing that can stop working on a Sunday. On an iPhone or iPad the link
 * opens the Google Maps app when it is installed and the website when it is
 * not, and either way the destination is already filled in - which is the
 * whole job on a site where somebody is holding a phone in one hand.
 *
 * The destination is the address text rather than coordinates because the
 * client's list has no coordinates. Google resolves a UK retail address
 * reliably; ", UK" is appended so an ambiguous town does not send anybody to
 * the wrong country.
 */

/** Where to send somebody for this store, or null when there is no address. */
export function directionsUrl(
  store: { address: string | null; postcode?: string | null },
): string | null {
  const destination = (store.address ?? "").trim();
  if (!destination) return null;
  const query = /\bUK$|United Kingdom$/i.test(destination)
    ? destination
    : `${destination}, UK`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

/** The same place without a route, for looking at where it is. */
export function mapUrl(store: { address: string | null }): string | null {
  const destination = (store.address ?? "").trim();
  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${destination}, UK`)}`;
}
