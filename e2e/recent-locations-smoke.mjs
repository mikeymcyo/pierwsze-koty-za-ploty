/**
 * Recent locations: the stores a person opened or asked the way to.
 *
 * History, not a CRM. What is checked here is the shape of the promise: a
 * key is validated for shape and against the shipped directory before
 * anything is written; the user is the session's and never the client's; a
 * revisit moves a store to the top rather than adding it twice; the list
 * is newest first and never more than twenty; the migration scopes every
 * row to its own user; a directions tap is recorded by a beacon that
 * survives the page being handed to Waze.
 *
 * Needs no Supabase, no dev server, no browser:
 *
 *   npm run test:recent-locations
 */

import { readFileSync } from "node:fs";

import {
  RECENT_LIMIT,
  knownStore,
  parseRecentKey,
  recentRows,
  recentTitle,
} from "../lib/stores/recent.ts";
import { reportPlace } from "../lib/reports/report-place.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. A key is checked for shape, then against the shipped directory");

check("a directory id and a store code pass", JSON.stringify(parseRecentKey({ directory: "lidl-gb", code: "1470" })) === JSON.stringify({ directory: "lidl-gb", code: "1470" }));
check("and are trimmed", parseRecentKey({ directory: " lidl-gb ", code: " 0034 " })?.code === "0034");
check("a missing part is refused", parseRecentKey({ directory: "lidl-gb" }) === null && parseRecentKey({ code: "1470" }) === null);
check("a non-string is refused", parseRecentKey({ directory: ["lidl-gb"], code: 1470 }) === null);
check("a path or a query in the code is refused", parseRecentKey({ directory: "lidl-gb", code: "../x" }) === null && parseRecentKey({ directory: "lidl-gb", code: "1470?x=1" }) === null);
check("an over-long code is refused", parseRecentKey({ directory: "lidl-gb", code: "1".repeat(40) }) === null);
check("a directory id with a slash is refused", parseRecentKey({ directory: "lidl/gb", code: "1470" }) === null);

const tiny = { "lidl-gb": { "1470": { displayName: "Croydon", displayCode: "1470" } } };
const lookup = (directory, code) => tiny[directory]?.[code] ?? null;
check("a store the directory ships is known", knownStore({ directory: "lidl-gb", code: "1470" }, lookup)?.displayCode === "1470");
check("one it does not is not, whatever the shape", knownStore({ directory: "lidl-gb", code: "9999" }, lookup) === null && knownStore({ directory: "tesco", code: "1470" }, lookup) === null);

console.log("\n2. Newest first, never more than twenty, the same identity a report card prints");

check("the limit is twenty", RECENT_LIMIT === 20);
const rows = Array.from({ length: 25 }, (_, i) => ({ code: String(i), visitedAt: new Date(1_700_000_000_000 + i * 1000).toISOString() }));
const shown = recentRows(rows);
check("twenty-five become twenty", shown.length === 20);
check("newest first", shown[0].code === "24" && shown[19].code === "5");
check("a title reads as the report card does", recentTitle({ displayName: "Croydon", displayCode: "1470" }) === "Croydon · Store 1470" && recentTitle({ displayName: "Croydon", displayCode: "1470" }) === reportPlace(null, { displayName: "Croydon", displayCode: "1470" }));

console.log("\n3. The migration scopes every row to its own user");

const migration = read("../supabase/migrations/20260917000013_recent_locations.sql");
check("one table, keyed by user and store", /create table public\.recent_locations/.test(migration) && /primary key \(user_id, directory, code\)/.test(migration));
check("row level security is on", /alter table public\.recent_locations enable row level security/.test(migration));
for (const cmd of ["select", "insert", "update", "delete"]) {
  const policy = new RegExp(`create policy "recent_locations_${cmd}_self" on public\\.recent_locations\\s+for ${cmd} to authenticated`);
  check(`${cmd} is the user's own rows only`, policy.test(migration));
}
check("every policy compares user_id to auth.uid() and nothing else", (migration.match(/user_id = auth\.uid\(\)/g) ?? []).length === 5 && !/is_company_member/.test(migration));
check("anon has nothing", /revoke all on public\.recent_locations from anon/.test(migration));
check("no other table is touched", !/alter table public\.(?!recent_locations)/.test(migration) && (migration.match(/create table/g) ?? []).length === 1);
check("the rollback is written down", /drop table public\.recent_locations/.test(migration));

console.log("\n4. The server decides who visited; the client only says where");

const server = read("../lib/stores/recent-server.ts");
check("user_id comes from the session", /user_id: session\.userId/.test(server) && !/user_id: (input|body|key)\./.test(server));
check("the key is parsed for shape first", /const key = parseRecentKey\(input\);\s*if \(!key\) return \{ ok: false, reason: "invalid" \};/.test(server));
check("then checked against the shipped directory", /if \(!knownStore\(key, storeIn\)\) return \{ ok: false, reason: "unknown" \};/.test(server));
check("a revisit is an upsert on the primary key with a fresh time", /\.upsert\(\s*\{[\s\S]*?visited_at: new Date\(\)\.toISOString\(\),[\s\S]*?\{ onConflict: "user_id,directory,code" \}/.test(server));
check("the tail past twenty is trimmed on write", /\.range\(RECENT_LIMIT, RECENT_LIMIT \+ 49\)/.test(server) && /\.delete\(\)\s*\.eq\("user_id", session\.userId\)/.test(server));
check("the read is the user's own rows, newest first, capped", /\.eq\("user_id", userId\)\s*\.order\("visited_at", \{ ascending: false \}\)\s*\.limit\(RECENT_LIMIT\)/.test(server));
check("a store that left the directory is dropped, not shown blank", /return store \? \[\{ store, visitedAt: row\.visited_at \}\] : \[\];/.test(server));

const route = read("../app/(app)/stores/recent/route.ts");
check("the beacon route refuses another origin", /new URL\(origin\)\.host !== host/.test(route) && /status: 403/.test(route));
check("and hands the body to the same validated recorder", /recordRecentLocation\(body\)/.test(route) && !/user_id|userId/.test(codeOf(route)));

const remove = read("../app/(app)/stores/recent-actions.ts");
check("removal is the user's own row, by the same two keys", /\.delete\(\)\s*\.eq\("user_id", session\.userId\)\s*\.eq\("directory", key\.directory\)\s*\.eq\("code", key\.code\)/.test(remove));

console.log("\n5. Recording survives the page being handed to Maps or Waze");

const recorder = read("../components/stores/recent-recorder.tsx");
check("a beacon first", /navigator\.sendBeacon\("\/stores\/recent", blob\)/.test(recorder));
check("keepalive fetch behind it", /keepalive: true/.test(recorder));
check("nothing waits on the answer", !/await /.test(codeOf(recorder)));
check("opening a store records it once", /useEffect\(\(\) => \{\s*recordRecentVisit\(directory, code\);\s*\}, \[directory, code\]\);/.test(recorder));

const links = read("../components/stores/directions-links.tsx");
check("Directions and Waze record on tap, before the browser follows the link", /onClick=\{record\}/.test(links) && (links.match(/onClick=\{record\}/g) ?? []).length === 2);
check("the links themselves are unchanged plain hrefs", /href=\{directions\} target="_blank" rel="noopener noreferrer"/.test(links) && /href=\{waze\} target="_blank" rel="noopener noreferrer"/.test(links));

const storePage = read("../app/(app)/stores/[code]/page.tsx");
check("the store page records a visit and uses the recording links", /<RecentRecorder directory=\{store\.directoryId\} code=\{store\.code\} \/>/.test(storePage) && /<DirectionsLinks/.test(storePage) && !/<a href=\{directions\}/.test(storePage));
check("so does the project's linked store card", /<DirectionsLinks/.test(read("../components/stores/linked-store-card.tsx")));

console.log("\n6. On the locator, above the results, only while the search is empty");

const locator = read("../app/(app)/stores/page.tsx");
check("recent is loaded only when nothing is being searched", /const searching = Boolean\(search\.q\?\.trim\(\) \|\| search\.rdc \|\| search\.night === "1"\);/.test(locator) && /searching \? \[\] : await loadRecentLocations/.test(locator));
check("and rendered under the search box, above the results", locator.indexOf("<StoreSearch") < locator.indexOf("<RecentLocations") && locator.indexOf("<RecentLocations") < locator.indexOf("results.length === 0"));
const list = read("../components/stores/recent-locations.tsx");
check("each row is the store's identity and address, and opens the store", /recentTitle\(store\)/.test(list) && /href=\{`\/stores\/\$\{store\.code\}`\}/.test(list) && /store\.address \?\? "No address recorded"/.test(list));
check("with Directions and Waze beside it", /<DirectionsLinks/.test(list));
check("and one small remove control per row", /action=\{removeRecentLocation\}/.test(list) && /aria-label=\{`Remove \$\{recentTitle\(store\)\} from recent locations`\}/.test(list));
check("nothing to show, nothing drawn", /if \(recent\.length === 0\) return null;/.test(list));
check("no notes, statuses or leads anywhere near it", !/note|status|lead|crm/i.test(codeOf(list).replace(/History, not a CRM/i, "")));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("All checks passed.");
} else {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(`  FAILED: ${failure}`);
  process.exitCode = 1;
}
