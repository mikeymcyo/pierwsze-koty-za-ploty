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

console.log("\n7b. A consolidated report orders its own links, not the photograph");
const summaryAction = read("../app/(app)/summary-reports/photo-actions.ts");
const summaryReorder = summaryAction.slice(summaryAction.indexOf("export async function reorderSummaryPhotos"));
const summaryBody = summaryReorder.slice(0, summaryReorder.indexOf("/**\n * Takes a photograph out"));
check("it writes the link table", /from\("summary_report_photos"\)/.test(summaryBody));
check("only sort_order is written", /update\(\{ sort_order: sortOrder \}\)/.test(summaryBody));
check(
  // A photograph can be in a daily report and a progress report at once; the
  // order it prints in one is nothing to do with the other.
  "and never the photograph itself",
  !/from\("photos"\)/.test(summaryBody),
);
check(
  "no caption, status or path is touched",
  !/caption|category|storage_path|caption_override/.test(summaryBody),
);
check("no file is uploaded, copied or removed", !/storage|PHOTO_BUCKET|remove\(/.test(summaryBody));
check("nothing is inserted or deleted", !/\.insert\(|\.delete\(/.test(summaryBody));
check("the order is validated against the database", /isSameSet\(photoIds/.test(summaryBody));
check("and scoped to this report on the write as well", /\.eq\("summary_report_id", reportId\)/.test(summaryBody));
check(
  "an issued report is refused, by the same guard every other write uses",
  /editableReport\(supabase, reportId\)/.test(summaryBody),
);
check(
  "which is what refuses a final report",
  /status === "final"/.test(summaryAction) && /SUMMARY_REPORT_IS_FINAL/.test(summaryAction),
);
check(
  "both actions share the rules rather than keeping two copies",
  /from "@\/lib\/photos-order"/.test(summaryAction) &&
    /from "@\/lib\/photos-order"/.test(action),
);

console.log("\n7c. One reorder control, not two");
const control = read("../components/reports/photo-reorder.tsx");
check("the state, debounce and gesture live in one module", /export function usePhotoOrder/.test(control));
check(
  "with one set of controls",
  /export function PhotoOrderBar/.test(control) &&
    /export function usePhotoDrag/.test(control) &&
    /export function PhotoOrderCaption/.test(control),
);
for (const [name, file] of [
  ["the daily grid", "../components/reports/photo-grid.tsx"],
  ["the consolidated list", "../components/summary-reports/report-photos.tsx"],
]) {
  const screen = read(file);
  check(`${name} uses it`, /from "@\/components\/reports\/photo-reorder"/.test(screen));
  check(`${name} keeps no timer of its own`, !/setTimeout/.test(screen));
  check(`${name} keeps no move logic of its own`, !/movePhotoEarlier|movePhotoLater/.test(screen));
  check(`${name} says the same thing`, /PhotoOrderBar/.test(screen) && /PhotoOrderHint/.test(screen));
}

console.log("\n7d. Every document kind reaches it");
const summaryPage = read("../app/(app)/summary-reports/[id]/page.tsx");
check(
  "a survey and a directly-written report order in place",
  /!isFinal && direct \? \(\s*\n\s*<ReportPhotos/.test(summaryPage),
);
check(
  "and a consolidating progress or completion report gets the ordering half",
  /!isFinal && !direct && attachedPhotos\.length > 1/.test(summaryPage) && /manage=\{false\}/.test(summaryPage),
);
check(
  "the screen reads the links in the order they print",
  /summary_report_photos"\)\.select\("photo_id, caption_override, sort_order"\)[\s\S]{0,120}order\("sort_order", \{ ascending: true \}\)/.test(summaryPage),
);
check(
  "so does the PDF",
  /summary_report_photos"\)[\s\S]{0,200}order\("sort_order", \{ ascending: true \}\)/.test(
    read("../lib/summary-reports/pdf-data.ts"),
  ),
);
check(
  "and a new photograph still lands at the end rather than the front",
  /sort_order: start \+ index/.test(summaryAction),
);

console.log("\n8. The screen only offers it where it means something");
const grid = read("../components/reports/photo-grid.tsx");
check(
  "a project's own photographs have no report to be ordered in",
  /Boolean\(reportId\) && deletable && photos\.length > 1/.test(grid),
);
check(
  "reordering is a mode, not something underfoot",
  /aria-pressed=\{reordering\}/.test(control),
);
check(
  "and a single photograph is never offered a reorder",
  /photos\.length > 1/.test(grid) &&
    /photos\.length > 1/.test(read("../components/summary-reports/report-photos.tsx")),
);
check("each plate shows the number it will print as", /photoReference\(index\)/.test(grid));
check(
  "and a plate says what it is and how to move it",
  /Photograph \$\{photoReference\(index\)\}\. Hold and drag to move it/.test(control),
);
check("the pair rule is on the screen, not just in the PDF", /appear side by side/.test(control));
check(
  "captions travel with the photograph, not the position",
  /photoId=\{photo\.id\}/.test(grid) && /caption=\{photo\.caption\}/.test(grid),
);


console.log("\n8b. The drag is built to survive a phone");

check(
  "a drag begins on a hold, not on contact, so the grid can still be scrolled",
  /const HOLD_MS = \d+/.test(control) && /setTimeout\(/.test(control),
);
check(
  "movement before the hold completes hands the gesture back to the page",
  /travelled > SLOP_PX/.test(control),
);
check(
  "the pointer is captured, so a fast drag keeps its target",
  /setPointerCapture\(pointerId\)/.test(control),
);
check(
  "and a browser that refuses the capture does not break the screen",
  /try \{[\s\S]{0,140}setPointerCapture[\s\S]{0,120}\} catch/.test(control),
);
check(
  "the scroll lock is native and non-passive - React's own touch listeners are passive",
  /addEventListener\("touchmove", hold, \{ passive: false \}\)/.test(control),
);
check(
  "and it is taken off again when the drag ends",
  /removeEventListener\("touchmove", hold\)/.test(control),
);
check(
  "the drop target is hit-tested live, because the tiles reflow under the finger",
  /elementFromPoint/.test(control) && /\[data-photo-id\]/.test(control),
);
check(
  "one set of listeners on the grid rather than a closure per tile",
  /gridProps/.test(control) && /tileProps/.test(control),
);
check(
  "the lifted tile stops taking pointer events, so the test sees underneath it",
  /pointer-events-none/.test(grid) &&
    /pointer-events-none/.test(read("../components/summary-reports/report-photos.tsx")),
);
check(
  "arrow keys still move a plate, for anybody not using a pointer",
  /ArrowLeft/.test(control) && /order\.move\(id, "earlier"\)/.test(control),
);
check("and no dependency was added for any of it", !/dnd|sortable|dragula/i.test(read("../package.json")));
check(
  "both screens drag through the shared hook",
  /usePhotoDrag/.test(grid) && /usePhotoDrag/.test(read("../components/summary-reports/report-photos.tsx")),
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
