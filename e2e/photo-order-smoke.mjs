/**
 * The order photographs print in, and everything reordering must not touch.
 *
 * The order is not cosmetic: plates are numbered from their position and the
 * PDF prints two to a row, so a before and an after next to each other read as
 * a pair and the same two three plates apart read as two unrelated pictures.
 *
 * Needs neither Supabase nor a browser.
 *
 *   npm run test:photo-order
 */
import { readFileSync } from "node:fs";

import {
  PLATES_PER_ROW,
  UNORDERED,
  isSameSet,
  movePhoto,
  movePhotoEarlier,
  movePhotoLater,
  sharesRow,
  sortOrderValues,
} from "../lib/photos-order.ts";
import { photoReference } from "../lib/pdf/photo-evidence.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

const IDS = ["a", "b", "c", "d"];

console.log("\n1. A photograph goes where it is put");
check("one step earlier", movePhotoEarlier(IDS, "c").join() === "a,c,b,d");
check("one step later", movePhotoLater(IDS, "b").join() === "a,c,b,d");
check("to the front", movePhoto(IDS, "d", 0).join() === "d,a,b,c");
check("to the back", movePhoto(IDS, "a", 3).join() === "b,c,d,a");

console.log("\n2. A tap that cannot mean anything does nothing");
check("the first cannot go earlier", movePhotoEarlier(IDS, "a").join() === IDS.join());
check("and does not wrap round to the back", movePhotoEarlier(IDS, "a")[3] === "d");
check("the last cannot go later", movePhotoLater(IDS, "d").join() === IDS.join());
check("an unknown id changes nothing", movePhoto(IDS, "zz", 0).join() === IDS.join());
check("nor does moving one onto itself", movePhoto(IDS, "b", 1).join() === IDS.join());
check("the original list is never mutated", IDS.join() === "a,b,c,d");

console.log("\n3. No photograph is ever lost or duplicated by a move");
for (const id of IDS) {
  for (const to of [-1, 0, 1, 2, 3, 4]) {
    const moved = movePhoto(IDS, id, to);
    check(
      `${id} -> ${to} keeps all four, once each`,
      moved.length === 4 && new Set(moved).size === 4 && IDS.every((one) => moved.includes(one)),
      moved.join(),
    );
  }
}

console.log("\n4. Stored positions start at one, not zero");
const values = sortOrderValues(IDS);
check("one-based", values[0].sortOrder === 1 && values[3].sortOrder === 4);
check("in the order given", values.map((value) => value.id).join() === "a,b,c,d");
check(
  // Every existing row carries 0 and the lists fall back to created_at, so a
  // report nobody has reordered stays in upload order.
  "so a saved position is never mistaken for an unordered one",
  UNORDERED === 0 && values.every((value) => value.sortOrder !== UNORDERED),
);

console.log("\n5. A submitted order is checked against what the report holds");
check("the same four, reordered, is fine", isSameSet(["d", "c", "b", "a"], IDS));
check("one missing is refused", !isSameSet(["a", "b", "c"], IDS));
check("an extra id is refused", !isSameSet(["a", "b", "c", "d", "e"], IDS));
check("a foreign id is refused", !isSameSet(["a", "b", "c", "zz"], IDS));
check("a duplicate is refused", !isSameSet(["a", "a", "b", "c"], IDS));
check("an empty list against a full report is refused", !isSameSet([], IDS));

console.log("\n6. Which plates share a row, so a pair can be placed");
check("the PDF prints two to a row", PLATES_PER_ROW === 2);
check("P01 and P02 are side by side", sharesRow(0, 1));
check("P02 and P03 are not", !sharesRow(1, 2));
check("P03 and P04 are", sharesRow(2, 3));
check(
  "and the references the screen shows are the PDF's own",
  photoReference(0) === "P01" && photoReference(9) === "P10",
);

console.log("\n7. Reordering writes one column and touches no file");
const action = read("../app/(app)/reports/photo-actions.ts");
const reorder = action.slice(action.indexOf("export async function reorderReportPhotos"));
const body = reorder.slice(0, reorder.indexOf("export type PhotoDescriptionState"));
check("only sort_order is written", /update\(\{ sort_order: sortOrder \}\)/.test(body));
check(
  "no caption, status or path is touched",
  !/caption|category|storage_path|original_caption/.test(body),
);
check("no file is uploaded, copied or removed", !/storage|PHOTO_BUCKET|remove\(/.test(body));
check("nothing is inserted or deleted", !/\.insert\(|\.delete\(/.test(body));
check("the order is validated against the database", /isSameSet\(photoIds/.test(body));
check("and scoped to this report on the write as well", /\.eq\("report_id", reportId\)/.test(body));
check("an issued report is refused", /status === "final"/.test(body) && /REPORT_IS_FINAL/.test(body));

console.log("\n8. The screen only offers it where it means something");
const grid = read("../components/reports/photo-grid.tsx");
check(
  "a project's own photographs have no report to be ordered in",
  /Boolean\(reportId\) && deletable && photos\.length > 1/.test(grid),
);
check("reordering is a mode, not something underfoot", /aria-pressed=\{reordering\}/.test(grid));
check("each plate shows the number it will print as", /photoReference\(index\)/.test(grid));
check("and the arrows say which plate they move", /Move \$\{photoReference\(index\)\} earlier/.test(grid));
check("the pair rule is on the screen, not just in the PDF", /appear side by side/.test(grid));
check(
  "captions travel with the photograph, not the position",
  /photoId=\{photo\.id\}/.test(grid) && /caption=\{photo\.caption\}/.test(grid),
);

console.log("\n9. The order reaches the document");
for (const [name, file] of [
  ["the draft preview", "../app/(app)/reports/[id]/preview/route.ts"],
  ["the issued render", "../app/(app)/reports/finalise-actions.ts"],
  ["the report screen", "../app/(app)/reports/[id]/page.tsx"],
]) {
  check(
    `${name} reads photographs in stored order`,
    /order\("sort_order", \{ ascending: true \}\)/.test(read(file)),
    file,
  );
}

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PHOTO ORDER CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
