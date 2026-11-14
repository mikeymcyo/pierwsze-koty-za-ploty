/**
 * Turns the client's store spreadsheets into the directory SiteBoss ships.
 *
 * Run it when a newer list arrives:
 *
 *   node scripts/import-stores.mjs "UK Stores September.xlsx" \
 *     --nightshift "Current Nightshift Stores BELVEDERE.xlsx" \
 *     --out lib/stores/lidl-gb.json
 *
 * then commit the result. That is the whole update process: one command, one
 * reviewable diff, no admin screen to build and no database write to get wrong.
 * A bad import is a git revert rather than an incident.
 *
 * Reads .xlsx directly - an xlsx is a zip of XML - so there is no spreadsheet
 * dependency to keep current.
 *
 * The store list is expected to carry the four columns the client's own file
 * has: P/BA (the store number), Name, RDC, Address. The night shift file is a
 * separate review sheet covering one region; its store numbers are matched
 * back onto the directory.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

// --- just enough xlsx --------------------------------------------------------

/** The files inside a zip, by name. Stored and deflated entries only. */
function unzip(buffer) {
  const files = new Map();
  // Walk the central directory backwards from the end-of-central-directory record.
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("Not a zip file.");
  let offset = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);

  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? data : inflateRawSync(data));

    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

/** The first worksheet as rows of cells, keyed by column letter. */
function readSheet(path) {
  const files = unzip(readFileSync(path));
  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...sharedXml.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(""),
      )
    : [];

  const sheetName = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetName) throw new Error(`No worksheet in ${path}`);
  const xml = files.get(sheetName).toString("utf8");

  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = {};
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const [, column, attributes, body] = cell;
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      if (value === "") continue;
      cells[column] = / t="s"/.test(attributes)
        ? shared[Number(value)]
        : / t="str"/.test(attributes)
          ? decode(value)
          : value;
    }
    return cells;
  });
}

// --- the directory -----------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : argv[index + 1];
};
const source = argv.find((argument) => !argument.startsWith("--") && !argv[argv.indexOf(argument) - 1]?.startsWith("--"));
const out = flag("out") ?? "lib/stores/lidl-gb.json";

if (!source) {
  console.error("Usage: node scripts/import-stores.mjs <stores.xlsx> [--nightshift <file.xlsx>] [--out <file.json>]");
  process.exit(1);
}

const rows = readSheet(source);
const header = rows[0] ?? {};
const columnFor = (label) =>
  Object.keys(header).find((column) => String(header[column]).trim().toLowerCase() === label);

const columns = {
  code: columnFor("p/ba") ?? "A",
  name: columnFor("name") ?? "B",
  rdc: columnFor("rdc") ?? "C",
  address: columnFor("address") ?? "D",
};

const stores = [];
for (const row of rows.slice(1)) {
  const code = String(row[columns.code] ?? "").trim();
  const name = String(row[columns.name] ?? "").trim();
  if (!code || !name) continue;
  stores.push({
    code,
    name,
    rdc: String(row[columns.rdc] ?? "").trim() || null,
    address: String(row[columns.address] ?? "").trim() || null,
  });
}

// The night shift sheet names its stores "0034 Streatham", so the number is
// taken off the front and matched back. A store it does not mention is left
// unknown rather than recorded as "no night shift" - the sheet covers one
// region, and silence about a store elsewhere is not an answer about it.
const nightshiftFile = flag("nightshift");
if (nightshiftFile) {
  const nightRows = readSheet(nightshiftFile);
  const byCode = new Map(stores.map((store) => [String(Number(store.code)), store]));
  for (const row of nightRows) {
    const label = String(row.D ?? "").trim();
    const answer = String(row.E ?? "").trim().toLowerCase();
    const match = /^(\d+)/.exec(label);
    if (!match || !answer) continue;
    const store = byCode.get(String(Number(match[1])));
    if (!store) continue;
    store.nightShift = answer.startsWith("y");
    const hours = String(row.G ?? "").trim();
    if (store.nightShift && hours && !/^no\b/i.test(hours)) store.nightShiftHours = hours;
  }
}

const directory = {
  id: "lidl-gb",
  client: "Lidl GB",
  label: "Lidl GB stores",
  codeLabel: "Store number",
  source: source.split("/").pop(),
  importedAt: new Date().toISOString().slice(0, 10),
  stores: stores.sort((a, b) => Number(a.code) - Number(b.code)),
};

writeFileSync(out, `${JSON.stringify(directory, null, 0)}\n`);
console.log(
  `${directory.stores.length} stores -> ${out}` +
    (nightshiftFile
      ? `, ${directory.stores.filter((store) => store.nightShift !== undefined).length} with a night shift answer`
      : ""),
);
