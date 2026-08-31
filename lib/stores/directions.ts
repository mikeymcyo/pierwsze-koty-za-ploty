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
 * What changed, and why
 * ---------------------
 *
 * The whole address used to be handed over as one string:
 *
 *   London, Croydon, 375-401 Brighton Road, CR2 6ES
 *
 * That is how the client's spreadsheet lists a store - widest first - and it is
 * not a postal address. Google reads it as a search: it has to work out that
 * "London" is not the destination, that "Croydon" is not either, and that the
 * building is the third part. On a phone with one bar that resolution is the
 * wait people were seeing before the map appeared.
 *
 * A UK postcode identifies a handful of adjacent addresses, so a street line
 * and a postcode together are a complete, unambiguous destination that needs no
 * disambiguation at all:
 *
 *   375-401 Brighton Road, CR2 6ES, United Kingdom
 *
 * The leading town and locality are dropped deliberately. They add nothing the
 * postcode does not already say, and they are the part that made it look like a
 * search.
 *
 * The client's list has four columns - store number, name, RDC and address -
 * with no latitude or longitude anywhere, and deriving them would mean a
 * geocoding service, an API key and a bill. Nothing here needs one. A
 * directory that does carry a point is preferred over the address by every
 * link below, because a point needs no resolving at all; one that does not
 * falls back to the address exactly as it always has, so today nothing about
 * the Google links changes.
 *
 * Waze
 * ----
 *
 * `https://waze.com/ul` is Waze's universal link. On an iPhone with the app
 * installed iOS opens the app; without it, the same URL opens Waze on the web.
 * One address, no user-agent sniffing, no second scheme to try and no way to
 * land on a page saying the link could not be opened - the same bargain the
 * Google link already makes, which is why Waze is one more button rather than a
 * mapping system.
 */

/** Enough of a postcode to tell one from a street name. */
const POSTCODE_SHAPE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

const COUNTRY = "United Kingdom";

function normalise(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * The destination to hand to a map, as precise as the client's data allows.
 *
 * Street line plus postcode where there is one, which is a complete UK
 * address; the whole thing otherwise, which is all there is to give. Returns
 * null only when there is nothing at all to go on.
 */
export function directionsDestination(store: {
  address: string | null;
  postcode?: string | null;
}): string | null {
  const address = (store.address ?? "").trim();
  const postcode = (store.postcode ?? "").trim();

  if (!address) return postcode ? `${postcode}, ${COUNTRY}` : null;

  // Already spelled out for a map by whoever wrote it - leave it alone.
  if (/\b(?:UK|United Kingdom)$/i.test(address)) return address;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  // Where the postcode was not passed in, the client's list always ends with
  // it, so the last part is checked for one rather than the whole string
  // scanned.
  const last = parts[parts.length - 1] ?? "";
  const code = postcode || (POSTCODE_SHAPE.test(last) ? last : "");
  if (!code) return `${address}, ${COUNTRY}`;

  // Everything that is not the postcode, narrowest first: the last remaining
  // part is the street line.
  const street = parts.filter((part) => normalise(part) !== normalise(code)).pop();

  return street ? `${street}, ${code}, ${COUNTRY}` : `${code}, ${COUNTRY}`;
}


/** The point where there is one, the written destination otherwise. */
function pointOrDestination(store: {
  address: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const point = storePoint(store);
  return point ? pointText(point) : directionsDestination(store);
}

/**
 * Where to send somebody for this store, or null when there is nothing to go
 * on.
 *
 * `travelmode=driving` is set so the app opens on a route rather than on the
 * mode picker. `dir_action=navigate` is deliberately not: somebody tapping
 * Directions from a store record is often checking where it is, and starting
 * turn-by-turn at them uninvited is not the same request.
 */
export function directionsUrl(store: {
  address: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  // A point where the directory has one, the address otherwise. Today's list
  // has none, so this is the same URL it has always produced.
  const destination = pointOrDestination(store);
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(
    destination,
  )}`;
}

/** The same place without a route, for looking at where it is. */
export function mapUrl(store: {
  address: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const destination = pointOrDestination(store);
  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

/**
 * A point, where the directory has a usable one.
 *
 * Checked rather than trusted: a directory file is data, and a latitude of 200
 * or a longitude that arrived as a string would send somebody to the middle of
 * the sea. Anything that is not a real point on the ground is treated as
 * absent, and the address is used instead.
 */
export function storePoint(store: {
  latitude?: number | null;
  longitude?: number | null;
}): { latitude: number; longitude: number } | null {
  const { latitude, longitude } = store;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 is in the Gulf of Guinea and is what an empty spreadsheet cell becomes.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** "51.35921,-0.09314" - what a map wants, and short enough to read in a URL. */
function pointText(point: { latitude: number; longitude: number }): string {
  return `${point.latitude},${point.longitude}`;
}

/**
 * The same store, in Waze.
 *
 * Coordinates where the directory has them - `ll` is a point and needs no
 * resolving - and the same street-and-postcode destination as Google otherwise,
 * through `q`, which Waze searches exactly as Google does.
 *
 * `navigate=yes` is deliberately not set, for the same reason
 * `dir_action=navigate` is not set on the Google link above: somebody tapping a
 * store's directions is often checking where it is, and starting turn-by-turn
 * at them uninvited is not the same request. Waze opens on the destination with
 * the Go button under their thumb.
 */
export function wazeUrl(store: {
  address: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const point = storePoint(store);
  if (point) return `https://waze.com/ul?ll=${encodeURIComponent(pointText(point))}`;

  const destination = directionsDestination(store);
  if (!destination) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}`;
}
