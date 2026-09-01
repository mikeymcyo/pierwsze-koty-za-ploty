/**
 * An extracted item is a citation, not a claim.
 *
 * A model handed a purchase order will happily return an order number that is
 * not in it, and the output looks identical either way. By the time it has
 * been read into a report as job scope, nobody can tell which half was read
 * and which half was invented.
 *
 * So what is checked here is that the check itself works: that a quote which
 * is not in the document is dropped rather than softened, that a real quote
 * survives the way a PDF text layer actually mangles text, and that an
 * extraction with nothing left standing is a failure rather than an empty
 * success.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:document-extraction
 */

import { readFileSync } from "node:fs";

import {
  COMMITMENTS,
  EXTRACTION_JSON_SCHEMA,
  comparable,
  extractionContentSchema,
  isEmpty,
  locateQuote,
  parseExtraction,
  verifyAgainstSource,
} from "../lib/documents/extraction-schema.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

/** A PDF text layer, with the breakage a real one has. */
const PAGES = [
  {
    page: 1,
    text: "LIDL GB LIMITED\nPURCHASE ORDER\nOrder number 4501234567\nSite: Store 1848, Bakery\n",
  },
  {
    page: 2,
    // Broken mid-phrase and mid-number, which is what pdfjs actually returns.
    text: "Repair the leaking bakery sink and rectify the ware\nhouse doors.\nAll operatives to hold a\nvalid CSCS card. Works to be carried out\noutside trading hours.\nQuotation only: replacement of the\nfloor covering, £ 4,250.00\n",
  },
];

const field = (over = {}) => ({
  key: "order_number",
  label: "Order number",
  value: "4501234567",
  page: 1,
  quote: "Order number 4501234567",
  ...over,
});
const scope = (over = {}) => ({
  text: "Repair the leaking bakery sink",
  commitment: "instructed",
  page: 2,
  quote: "Repair the leaking bakery sink",
  ...over,
});
const requirement = (over = {}) => ({
  text: "Operatives to hold a valid CSCS card",
  page: 2,
  quote: "All operatives to hold a valid CSCS card",
  ...over,
});
const content = (over = {}) => ({
  document_kind: "Purchase order",
  summary: "A purchase order from Lidl GB for works at Store 1848.",
  fields: [field()],
  scope_items: [scope()],
  requirements: [requirement()],
  ...over,
});

console.log("\n1. A quote that is really in the document survives being mangled by the PDF");

check(
  "a quote broken across a line break is still found",
  locateQuote("rectify the warehouse doors", PAGES, 2) === 2,
  "pdfjs split 'warehouse' across two lines",
);
check(
  "so is one the model reflowed onto one line",
  locateQuote("All operatives to hold a valid CSCS card", PAGES, 2) === 2,
);
check("and one that is simply correct", locateQuote("Order number 4501234567", PAGES, 1) === 1);
check(
  "a curly apostrophe and a straight one are the same words",
  comparable("don’t") === comparable("don't"),
);
check("whitespace is not part of the comparison", comparable("a b\nc") === "abc");
check("case is not either", comparable("CSCS") === comparable("cscs"));

console.log("\n2. A quote that is NOT in the document is dropped, not softened");

const fabricated = verifyAgainstSource(
  content({
    fields: [field(), field({ key: "completion_date", label: "Completion date", value: "12 September 2026", quote: "Completion date 12 September 2026" })],
  }),
  PAGES,
);
check("the invented field is gone", fabricated.content.fields.length === 1);
check("the real one is kept", fabricated.content.fields[0].key === "order_number");
check("and the caller is told what was dropped", fabricated.dropped.length === 1);
check(
  "by name, and for the right reason",
  fabricated.dropped[0].kind === "field" &&
    fabricated.dropped[0].reason === "not_in_document" &&
    /12 September 2026/.test(fabricated.dropped[0].text),
);
check(
  "nothing survives on a lower confidence",
  !JSON.stringify(fabricated.content).includes("12 September 2026"),
  "a fabrication must not reach anything downstream at all",
);

console.log("\n3. A true quote on the wrong page is corrected, not thrown away");

const misplaced = verifyAgainstSource(content({ scope_items: [scope({ page: 1 })] }), PAGES);
check("the reading is kept", misplaced.content.scope_items.length === 1);
check("with its page corrected", misplaced.content.scope_items[0].page === 2);
check("nothing is reported as dropped", misplaced.dropped.length === 0);
check(
  "and the correction is reported rather than done silently",
  misplaced.relocated.length === 1 &&
    misplaced.relocated[0].claimedPage === 1 &&
    misplaced.relocated[0].actualPage === 2,
);

console.log("\n4. Quoted work is not instructed work");

check("the three commitments exist", COMMITMENTS.join(",") === "instructed,proposed,described");
check(
  "and the model is told what each one means",
  /proposed: it is quoted, offered, estimated or recommended/.test(
    JSON.stringify(EXTRACTION_JSON_SCHEMA),
  ),
);
const quoted = extractionContentSchema.safeParse(
  content({
    scope_items: [
      scope({
        text: "Replacement of the floor covering",
        commitment: "proposed",
        quote: "Quotation only: replacement of the floor covering",
      }),
    ],
  }),
);
check("a quoted item is storable as proposed", quoted.success);
check(
  "but an invented commitment is not",
  !extractionContentSchema.safeParse(content({ scope_items: [scope({ commitment: "agreed" })] }))
    .success,
);

console.log("\n5. An extraction with nothing left standing is a failure, not an empty success");

const allFabricated = parseExtraction(
  content({
    fields: [field({ quote: "Order number 9999999999" })],
    scope_items: [scope({ quote: "Install a new fire alarm panel" })],
    requirements: [requirement({ quote: "Hot works permit required" })],
  }),
  PAGES,
);
check("it does not succeed", allFabricated.ok === false);
check(
  "and it says the document did not contain any of it",
  allFabricated.ok === false &&
    /Nothing the model reported could be found in the document/.test(allFabricated.error) &&
    /Nothing has been recorded/.test(allFabricated.error),
);
check("an empty extraction is recognised as empty", isEmpty(content({ fields: [], scope_items: [], requirements: [] })));

const good = parseExtraction(content(), PAGES);
check("a sound extraction succeeds", good.ok === true);
check(
  "with everything it read",
  good.ok &&
    good.extraction.content.fields.length === 1 &&
    good.extraction.content.scope_items.length === 1 &&
    good.extraction.content.requirements.length === 1,
);
check("and nothing dropped", good.ok && good.extraction.dropped.length === 0);

console.log("\n6. Output this app cannot read is refused, rather than half-used");

check("a missing page number is refused", !extractionContentSchema.safeParse(content({ fields: [{ key: "a", label: "A", value: "1", quote: "x" }] })).success);
check("a page number of zero is refused", !extractionContentSchema.safeParse(content({ fields: [field({ page: 0 })] })).success);
check("an empty quote is refused", !extractionContentSchema.safeParse(content({ fields: [field({ quote: "" })] })).success);
check(
  "a field key that is not snake_case is refused",
  !extractionContentSchema.safeParse(content({ fields: [field({ key: "Order Number" })] })).success,
);
check(
  "and the failure names where it happened",
  (() => {
    const bad = parseExtraction({ fields: [] }, PAGES);
    return bad.ok === false && /cannot read/.test(bad.error);
  })(),
);

console.log("\n7. The JSON schema and the Zod schema cannot drift apart unnoticed");

const jsonKeys = [...EXTRACTION_JSON_SCHEMA.required].sort().join(",");
const zodKeys = Object.keys(extractionContentSchema.shape).sort().join(",");
check("they require the same top-level keys", jsonKeys === zodKeys, `${jsonKeys} vs ${zodKeys}`);
for (const [name, list] of [
  ["fields", ["key", "label", "value", "page", "quote"]],
  ["scope_items", ["text", "commitment", "page", "quote"]],
  ["requirements", ["text", "page", "quote"]],
]) {
  check(
    `${name} require the same item keys`,
    [...EXTRACTION_JSON_SCHEMA.properties[name].items.required].sort().join(",") ===
      [...list].sort().join(","),
  );
}
check(
  "every item in the schema must carry a quote",
  ["fields", "scope_items", "requirements"].every((name) =>
    EXTRACTION_JSON_SCHEMA.properties[name].items.required.includes("quote"),
  ),
  "an item with no anchor into the document is a guess",
);

console.log("\n8. The module stays pure, so this test needs nothing to run");

const source = read("../lib/documents/extraction-schema.ts");
check("no server-only import", !/server-only/.test(source));
check("no database client", !/@\/lib\/supabase/.test(source));
check("no model call", !/openai|OpenAI/.test(source));

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL DOCUMENT EXTRACTION CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
