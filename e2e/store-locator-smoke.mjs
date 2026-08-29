/**
 * The store directory: finding a store, and what selecting one fills in.
 *
 * Covers the rules a site manager actually leans on - typing a store number
 * and getting that store first, leading zeros not mattering, a postcode
 * working with or without its space - and the one distinction the whole
 * integration rests on: a store is a place, a project is a job at it, and the
 * store number is not the project reference.
 *
 * Runs against the real shipped directory, so a bad import is caught here
 * rather than on somebody's iPad.
 *
 * Needs neither Supabase nor a browser.
 */
import { readFileSync } from "node:fs";

import {
  displayCode,
  displayName,
  distributionCentres,
  findStore,
  normaliseCode,
  normalisePostcode,
  postcodeOf,
  resolveStore,
  scoreStore,
  searchStores,
} from "../lib/stores/directory.ts";
import { directionsDestination, directionsUrl, mapUrl } from "../lib/stores/directions.ts";
import {
  newProjectHref,
  parseStoreLink,
  storeColumns,
  storeLinkOf,
  storeProjectDefaults,
} from "../lib/stores/project-link.ts";
import { reportSite, storeLine } from "../lib/reports/site-identity.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const file = JSON.parse(
  readFileSync(new URL("../lib/stores/lidl-gb.json", import.meta.url), "utf8"),
);
const { stores: rows, ...directory } = file;
const stores = rows.map((store) => resolveStore(store, directory));

console.log("\n1. The shipped directory is intact");
check("it is the Lidl GB list", directory.id === "lidl-gb" && directory.client === "Lidl GB");
check("it names the spreadsheet it came from", /\.xlsx$/.test(directory.source), directory.source);
check("every store is there", stores.length > 1200, String(stores.length));
check("no store number appears twice", new Set(stores.map((s) => s.code)).size === stores.length);
check("every store has a number and a name", stores.every((s) => s.code && s.name));
check(
  "nearly every store has a postcode read out of its address",
  stores.filter((s) => s.postcode).length / stores.length > 0.98,
  `${stores.filter((s) => s.postcode).length} of ${stores.length}`,
);
check("the distribution centres are the client's own", distributionCentres(stores).length === 14);
check(
  "night shift is recorded only where the client has reviewed it",
  stores.some((s) => s.nightShift === true) &&
    stores.some((s) => s.nightShift === null) &&
    stores.filter((s) => s.nightShift !== null).length < 200,
);

console.log("\n2. A store number is whatever the site manager types");
check("0034 and 34 are the same store", normaliseCode("0034") === normaliseCode("34"));
check("so are '34 ' and '#34'", normaliseCode("34 ") === "34" && normaliseCode("#34") === "34");
check("it is written the way the client writes it", displayCode("34") === "0034");
check("a four-figure number is left alone", displayCode("1470") === "1470");
check("and a longer one is not truncated", displayCode("12345") === "12345");
check("leading zeros in the source survive", displayCode("0034") === "0034");

console.log("\n3. Names and postcodes read properly");
check("a regional prefix is dropped for a heading", displayName("LON-South Croydon") === "South Croydon");
check("a name without one is untouched", displayName("Hinckley") === "Hinckley");
check("a hyphenated town is not mangled", displayName("Weston-Super-Mare") === "Weston-Super-Mare");
check("a postcode is read off the end of an address", postcodeOf("London, Croydon, 375-401 Brighton Road, CR2 6ES") === "CR2 6ES");
check("a missing space is corrected", postcodeOf("Yate, Kennedy Way, BS374BA") === "BS37 4BA");
check("an address without one answers null", postcodeOf("Somewhere, No Postcode Here") === null);
check("and so does nothing at all", postcodeOf(null) === null);
check("a postcode compares without its space", normalisePostcode("cr2 6es") === "CR26ES");
// Two faults in the client's own list, read rather than lost. Nothing is
// guessed: a genuinely truncated postcode still comes back null.
check("a letter O where the digit belongs is read", postcodeOf("Knaresborough, York Road, HG5 OSP") === "HG5 0SP");
check("and a stray space inside the inward code", postcodeOf("Connahs Quay, High Street, CH5 4 DD") === "CH5 4DD");
check("but a truncated postcode is not invented", postcodeOf("Skelmersdale, Tawd Valley Way, WN8 6") === null);

console.log("\n4. Searching finds what was asked for");
const croydon = findStore(stores, "1470");
check("store 1470 exists", croydon !== null);
check("it is South Croydon", croydon?.displayName === "South Croydon", croydon?.name);
check("with the address from the client's list", croydon?.address?.includes("Brighton Road") === true);
check("and its postcode", croydon?.postcode === "CR2 6ES", croydon?.postcode ?? "");
check("leading zeros do not matter when looking one up", findStore(stores, "0034")?.code === "34");

const byNumber = searchStores(stores, { text: "1470" });
check("searching the number puts that store first", byNumber[0]?.code === "1470", byNumber[0]?.code);
const byPaddedNumber = searchStores(stores, { text: "0034" });
check("and so does searching it padded", byPaddedNumber[0]?.code === "34", byPaddedNumber[0]?.code);
const byTown = searchStores(stores, { text: "south croydon" });
check("searching a town finds it", byTown.some((s) => s.code === "1470"));
check("and puts it first", byTown[0]?.code === "1470", byTown[0]?.displayName);
const byPostcode = searchStores(stores, { text: "CR2 6ES" });
check("searching a full postcode finds the store", byPostcode.some((s) => s.code === "1470"));
check(
  "and it works without the space",
  searchStores(stores, { text: "cr26es" }).some((s) => s.code === "1470"),
);
check(
  "a partial postcode still narrows it down",
  searchStores(stores, { text: "CR2" }).some((s) => s.code === "1470"),
);
check(
  "searching part of a street finds it",
  searchStores(stores, { text: "brighton road" }).some((s) => s.code === "1470"),
);
check("a search that matches nothing returns nothing", searchStores(stores, { text: "zzzzqqq" }).length === 0);
check("an empty search returns the list", searchStores(stores, {}, 25).length === 25);
check(
  "the same search always returns the same order",
  JSON.stringify(searchStores(stores, { text: "croydon" }).map((s) => s.code)) ===
    JSON.stringify(searchStores(stores, { text: "croydon" }).map((s) => s.code)),
);
check(
  "an exact number beats an address that merely contains it",
  scoreStore(croydon, "1470") < scoreStore({ ...croydon, code: "9999" }, "1470"),
);

console.log("\n5. The filters");
const bel = searchStores(stores, { rdc: "250 BEL" }, 5000);
check("filtering by RDC returns only that RDC", bel.every((s) => s.rdc === "250 BEL"));
check("and it returns something", bel.length > 50, String(bel.length));
const night = searchStores(stores, { nightShiftOnly: true }, 5000);
check("night shift only returns confirmed night shift stores", night.every((s) => s.nightShift === true));
check("a store the client has not reviewed is not claimed as one", night.every((s) => s.nightShift !== null));
check(
  "filters combine with the text",
  searchStores(stores, { text: "croydon", rdc: "250 BEL" }).every((s) => s.rdc === "250 BEL"),
);
check(
  "a filter that excludes the match returns nothing",
  searchStores(stores, { text: "1470", rdc: "430 EXE" }).length === 0,
);

console.log("\n6. Directions work from a phone with no API key");
const url = directionsUrl(croydon);
check("there is a link", typeof url === "string");
check(
  "it is Google Maps' own directions endpoint",
  url.startsWith("https://www.google.com/maps/dir/?api=1&"),
);
check("no API key is involved", !/key=|apikey/i.test(url));
check("it opens on a route rather than the mode picker", url.includes("travelmode=driving"));
check(
  "but does not start navigating at somebody uninvited",
  !url.includes("dir_action=navigate"),
);
check("a store with no address has no link", directionsUrl({ address: null }) === null);
check("looking at the place rather than routing to it also works", mapUrl(croydon)?.includes("/maps/search/") === true);

// The destination is a postal address, not a search. The client's list reads
// widest first - "London, Croydon, 375-401 Brighton Road, CR2 6ES" - which
// Google has to work through before it can show a route; a street line and a
// postcode identify the building outright.
console.log("\n7. The destination is precise enough not to be searched for");
check(
  "it is the street and the postcode",
  directionsDestination(croydon) === "375-401 Brighton Road, CR2 6ES, United Kingdom",
  directionsDestination(croydon),
);
check("and that is what the link carries", decodeURIComponent(url).includes("375-401 Brighton Road, CR2 6ES, United Kingdom"));
check(
  "the town and locality are dropped, because the postcode already says them",
  !directionsDestination(croydon).includes("London") &&
    !directionsDestination(croydon).includes("Croydon"),
);
check(
  "the country is named, so an ambiguous town is not another continent",
  directionsDestination(croydon).endsWith("United Kingdom"),
);
check(
  "a longer address still resolves to its street line",
  directionsDestination({
    address: "Chilwell, Nottingham, Broxtowe, West Point Shopping Ctre, Ranson Rd, NG9 6DX",
    postcode: "NG9 6DX",
  }) === "Ranson Rd, NG9 6DX, United Kingdom",
);
check(
  "an address with no postcode is used whole rather than guessed at",
  directionsDestination({ address: "Skelmersdale, Tawd Valley Way", postcode: null }) ===
    "Skelmersdale, Tawd Valley Way, United Kingdom",
);
check(
  "a postcode with no address is still a destination",
  directionsDestination({ address: null, postcode: "CR2 6ES" }) === "CR2 6ES, United Kingdom",
);
check(
  "nothing at all is no destination",
  directionsDestination({ address: null, postcode: null }) === null,
);
check(
  "an address that already names the country is left alone",
  directionsDestination({ address: "1 Some Road, UK" }) === "1 Some Road, UK",
);
// Whatever the client's list holds, the link has to work for every store.
const destinations = stores.map((store) => directionsDestination(store));
check("every store has a destination", destinations.every(Boolean));
check(
  "and nearly all of them are a street and a postcode",
  destinations.filter((d) => /, [A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}, United Kingdom$/.test(d))
    .length /
    stores.length >
    0.98,
  `${destinations.filter((d) => /, [A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}, United Kingdom$/.test(d)).length} of ${stores.length}`,
);

console.log("\n8. A store fills in the place, never the job");
const defaults = storeProjectDefaults(croydon);
check("the client comes from the directory", defaults.client === "Lidl GB");
check("so does the site address", defaults.site_address === croydon.address);
check("and the postcode", defaults.postcode === "CR2 6ES");
check(
  "the project reference is left alone - it names the works, not the building",
  !("project_reference" in defaults),
);
check("and so is the project name", !("name" in defaults));
check(
  "the form is filled from a lookup, not from the address bar",
  newProjectHref(croydon) === "/projects/new?directory=lidl-gb&store=1470",
  newProjectHref(croydon),
);

console.log("\n9. The link a project stores");
check("a project with no store has no link", storeLinkOf({}) === null);
check(
  "a project with one does",
  JSON.stringify(storeLinkOf({ location_directory: "lidl-gb", location_code: "1470" })) ===
    JSON.stringify({ directory: "lidl-gb", code: "1470" }),
);
check(
  "half a link read from anywhere is treated as none",
  storeLinkOf({ location_directory: "lidl-gb" }) === null &&
    storeLinkOf({ location_code: "1470" }) === null,
);
check("selecting nothing is a normal answer", parseStoreLink("", "").ok && parseStoreLink("", "").link === null);
check("half a link from a form is refused", !parseStoreLink("lidl-gb", "").ok);
check("and the other half too", !parseStoreLink("", "1470").ok);
check("an unbounded directory is refused", !parseStoreLink("x".repeat(41), "1470").ok);
check(
  "unlinking writes two nulls",
  JSON.stringify(storeColumns(null)) ===
    JSON.stringify({ location_directory: null, location_code: null }),
);
check(
  "linking writes the pair",
  JSON.stringify(storeColumns({ directory: "lidl-gb", code: "1470" })) ===
    JSON.stringify({ location_directory: "lidl-gb", location_code: "1470" }),
);

console.log("\n10. What a report says about the place");
const linked = reportSite({ client: null, site_address: null }, croydon);
check("an unwritten client comes from the store", linked.client === "Lidl GB");
check("an unwritten address too", linked.siteAddress === croydon.address);
check("and the store is named", storeLine(linked.store) === "South Croydon · 1470");
const written = reportSite(
  { client: "Lidl GB (North)", site_address: "Compound entrance, Brighton Road" },
  croydon,
);
check("what somebody wrote on the project always wins", written.client === "Lidl GB (North)");
check("including the address", written.siteAddress === "Compound entrance, Brighton Road");
check("the store is still named alongside it", storeLine(written.store) === "South Croydon · 1470");
const unlinked = reportSite({ client: "Riverside Ltd", site_address: "14 Wharf Road" }, null);
check("a project with no store prints no store line", storeLine(unlinked.store) === null);
check("and keeps its own client and address", unlinked.client === "Riverside Ltd");
check("whitespace on the project does not count as written", reportSite({ client: "   " }, croydon).client === "Lidl GB");

console.log("\n11. Nothing here reaches a company's own data");
for (const file of ["../lib/stores/directory.ts", "../lib/stores/directions.ts", "../lib/stores/project-link.ts"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  check(
    `${file.split("/").pop()}: no database client`,
    !/supabase|createClient|from\("/.test(source),
  );
}
const page = readFileSync(new URL("../app/(app)/stores/page.tsx", import.meta.url), "utf8");
check("the store list is behind the session like every other page", /requireSessionContext/.test(page));
check("and reads no company table", !/createClient|\.from\(/.test(page));

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL STORE LOCATOR CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
