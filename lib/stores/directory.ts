/**
 * The store directory: what a store is, and how one is found.
 *
 * Pure, with no runtime imports and no path aliases, so the search rules can
 * be tested without a database, a renderer or a browser.
 *
 * A store is a physical location that outlives any work done at it. A SiteBoss
 * project is one package of works at that location, and a location may carry
 * several over the years - so the two are deliberately separate things, joined
 * by a reference rather than merged. Nothing here knows about projects.
 *
 * The directory is client reference data, identical for every company that
 * uses SiteBoss, and it changes a few times a year when a new list arrives.
 * It is therefore shipped with the application rather than kept in the
 * database: search is instant and works on a bad signal, there is no
 * per-tenant copy to drift, no RLS surface on data that is not anybody's
 * secret, and an update is `node scripts/import-stores.mjs` plus a commit that
 * can be read in a diff and reverted like any other change.
 *
 * `directoryId` is what keeps this from becoming a Lidl-only application: a
 * project records which directory a code came from, so a second client's list
 * is another JSON file and nothing else.
 */

/** One row of the client's own list. */
export type Store = {
  /** The client's store number. "P/BA" on Lidl's spreadsheet. */
  code: string;
  name: string;
  rdc: string | null;
  address: string | null;
  /** Absent where the client's review has not reached this store. */
  nightShift?: boolean;
  nightShiftHours?: string;
  /**
   * Where the client's list carries a point rather than only an address.
   *
   * Optional because today's list does not: it has four columns - store
   * number, name, RDC and address - and no coordinates anywhere. A directory
   * that does carry them is preferred over the address by every map link, and
   * one that does not falls back to the address exactly as it always has. See
   * lib/stores/directions.ts.
   */
  latitude?: number;
  longitude?: number;
};

export type StoreDirectory = {
  /** Stable id recorded against a project. Never reused for another list. */
  id: string;
  /** The client these stores belong to, used to prefill a project. */
  client: string;
  label: string;
  /** What the client calls the number: "Store number", "Site number". */
  codeLabel: string;
  /** The spreadsheet this was built from, so a report can be traced back. */
  source: string;
  importedAt: string;
};

/** A store with everything the screens and the reports need already worked out. */
export type ResolvedStore = {
  directoryId: string;
  client: string;
  code: string;
  /** Zero-padded the way the client writes it: 1470, 0034. */
  displayCode: string;
  /** Exactly as the client's list has it, e.g. "LON-South Croydon". */
  name: string;
  /** The same without the regional prefix, for a heading. */
  displayName: string;
  rdc: string | null;
  address: string | null;
  postcode: string | null;
  /** True, false, or null where the client has not reviewed this store. */
  nightShift: boolean | null;
  nightShiftHours: string | null;
  /** A point on the ground, where the directory has one. */
  latitude: number | null;
  longitude: number | null;
};

/**
 * The number as the client writes it.
 *
 * Their spreadsheet holds 34 and their paperwork says 0034, so both have to
 * lead to the same store. Four digits is their convention; a longer number is
 * left alone rather than truncated.
 */
export function displayCode(code: string): string {
  const digits = code.trim().replace(/^0+(?=\d)/, "");
  return digits.length >= 4 ? digits : digits.padStart(4, "0");
}

/** The same number reduced to what it actually is, for comparing. */
export function normaliseCode(value: string): string {
  const digits = value.trim().replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

const REGION_PREFIX = /^[A-Z]{2,4}-\s*/;

/** "LON-South Croydon" reads as "South Croydon" in a heading. */
export function displayName(name: string): string {
  return name.replace(REGION_PREFIX, "").trim() || name.trim();
}

// A UK postcode at the end of a free-text address. The client's list has no
// postcode column - it is the tail of the address string - so it is read out
// rather than invented.
//
// Two typing faults in that list are tolerated rather than losing the postcode
// over them: a letter O where the inward code's digit belongs ("HG5 OSP"), and
// a stray space inside the inward code ("CH5 4 DD"). Both are read and written
// back correctly. Nothing is guessed - a genuinely truncated postcode like
// "WN8 6" still comes back null, and the address is used whole instead.
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*([\dO]\s*[A-Z]{2})\b/i;

export function postcodeOf(address: string | null | undefined): string | null {
  const match = address ? POSTCODE.exec(address) : null;
  if (!match) return null;
  const inward = match[2].replace(/\s+/g, "").toUpperCase().replace(/^O/, "0");
  return `${match[1].toUpperCase()} ${inward}`;
}

/** A postcode with its space and case removed, so "cr26es" finds "CR2 6ES". */
export function normalisePostcode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function resolveStore(store: Store, directory: StoreDirectory): ResolvedStore {
  return {
    directoryId: directory.id,
    client: directory.client,
    code: store.code,
    displayCode: displayCode(store.code),
    name: store.name,
    displayName: displayName(store.name),
    rdc: store.rdc ?? null,
    address: store.address ?? null,
    postcode: postcodeOf(store.address),
    nightShift: store.nightShift ?? null,
    nightShiftHours: store.nightShiftHours ?? null,
    latitude: store.latitude ?? null,
    longitude: store.longitude ?? null,
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type StoreQuery = {
  text?: string;
  /** One distribution centre, exactly as the list spells it. */
  rdc?: string | null;
  /** Only stores the client has confirmed run a night shift. */
  nightShiftOnly?: boolean;
};

function haystack(store: ResolvedStore): string {
  return [
    store.code,
    store.displayCode,
    store.name,
    store.displayName,
    store.rdc,
    store.address,
    store.postcode,
    store.postcode ? normalisePostcode(store.postcode) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * How well a store answers the query. Lower is better; -1 means it does not.
 *
 * A site manager searching "1470" wants store 1470 first, not the fifty
 * addresses with 1470 somewhere in them, so an exact number wins outright.
 * After that a number the store starts with, then a name, then anything that
 * merely contains the words.
 */
export function scoreStore(store: ResolvedStore, text: string): number {
  const query = text.trim().toLowerCase();
  if (!query) return 5;

  const digits = normaliseCode(query);
  if (digits && /^\d+$/.test(query.replace(/\s/g, ""))) {
    const code = normaliseCode(store.code);
    if (code === digits) return 0;
    if (code.startsWith(digits)) return 1;
  }

  const name = store.displayName.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 2;

  const postcode = store.postcode ? normalisePostcode(store.postcode) : "";
  const asPostcode = normalisePostcode(query);
  if (postcode && asPostcode.length >= 2 && postcode.startsWith(asPostcode)) return 3;

  return haystack(store).includes(query) ? 4 : -1;
}

/**
 * The stores that answer a query, best first.
 *
 * Ties break on the store number so the same search always returns the same
 * order - two people comparing screens on site should see the same list.
 */
export function searchStores(
  stores: readonly ResolvedStore[],
  query: StoreQuery,
  limit = 60,
): ResolvedStore[] {
  const text = (query.text ?? "").trim();
  const scored: { store: ResolvedStore; score: number }[] = [];

  for (const store of stores) {
    if (query.rdc && store.rdc !== query.rdc) continue;
    if (query.nightShiftOnly && store.nightShift !== true) continue;
    const score = scoreStore(store, text);
    if (score < 0) continue;
    scored.push({ store, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(normaliseCode(a.store.code)) - Number(normaliseCode(b.store.code)),
  );
  return scored.slice(0, limit).map((entry) => entry.store);
}

/** Every distribution centre in the list, for the filter. */
export function distributionCentres(stores: readonly ResolvedStore[]): string[] {
  return [...new Set(stores.flatMap((store) => (store.rdc ? [store.rdc] : [])))].sort();
}

/** The one store with this number, or null. Leading zeros do not matter. */
export function findStore(
  stores: readonly ResolvedStore[],
  code: string,
): ResolvedStore | null {
  const wanted = normaliseCode(code);
  return stores.find((store) => normaliseCode(store.code) === wanted) ?? null;
}
