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
  UNORDERED,
  isSameSet,
  movePhoto,
  swapPhotos,
  movePhotoEarlier,
  movePhotoLater,
  sortOrderValues,
} from "../lib/photos-order.ts";

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

console.log("\n1b. A drag swaps two photographs and moves nothing else");

// The tester's example, exactly. Dropping P01 onto P03 must give C, B, A, D -
// not the B, C, A, D that an insertion produces. A report somebody has already
// put in order must not come apart because they moved one picture.
const ABCD = ["a", "b", "c", "d"];
check("dropping the first onto the third exchanges the two", swapPhotos(ABCD, "a", "c").join() === "c,b,a,d");
check("and the two between them do not move", swapPhotos(ABCD, "a", "d").join() === "d,b,c,a");
check("it is not an insertion", swapPhotos(ABCD, "a", "c").join() !== movePhoto(ABCD, "a", 2).join());
check("neighbours swap like a one-step move", swapPhotos(ABCD, "a", "b").join() === movePhotoLater(ABCD, "a").join());
check("a photograph dropped on itself changes nothing", swapPhotos(ABCD, "b", "b").join() === ABCD.join());
check("an unknown id changes nothing", swapPhotos(ABCD, "zz", "b").join() === ABCD.join());
check("and neither does an unknown target", swapPhotos(ABCD, "b", "zz").join() === ABCD.join());
check("the original list is never altered", ABCD.join() === "a,b,c,d");
check(
  "nothing is lost or duplicated, whichever two are swapped",
  ABCD.every((from) =>
    ABCD.every((to) => {
      const next = swapPhotos(ABCD, from, to);
      return next.length === 4 && new Set(next).size === 4;
    }),
  ),
);

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

const arrangeView = read("../components/reports/photo-arrange.tsx");

console.log("\n6. Order is sequence, and says nothing about the PDF's layout");

// It used to. The module exported PLATES_PER_ROW and sharesRow and the screen
// promised that the photograph just placed would "print beside P01" - a
// guarantee it was in no position to make, because how many plates go on a row
// is the document's decision and it is free to change it.
const orderModule = read("../lib/photos-order.ts");
// The exports, not the word: the comment explaining why they went names them.
check("no plates-per-row constant is exported", !/export const PLATES_PER_ROW/.test(orderModule));
check("and nothing exported works out what shares a row", !/export function sharesRow/.test(orderModule));
check(
  "the module says why, so it is not put back",
  /Order is sequence/.test(orderModule),
);
for (const [name, file] of [
  ["the reorder control", "../components/reports/photo-reorder.tsx"],
  ["the arrange view", "../components/reports/photo-arrange.tsx"],
  ["the daily grid", "../components/reports/photo-grid.tsx"],
  ["the consolidated list", "../components/summary-reports/report-photos.tsx"],
]) {
  const screen = read(file);
  check(`${name} promises nothing about rows`, !/Prints beside|plates to a row|side by side/.test(screen), file);
}

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
  "with one switch into it, shared by every screen",
  /export function PhotoOrderBar/.test(control),
);
for (const [name, file] of [
  ["the daily grid", "../components/reports/photo-grid.tsx"],
  ["the consolidated list", "../components/summary-reports/report-photos.tsx"],
]) {
  const screen = read(file);
  check(`${name} uses it`, /from "@\/components\/reports\/photo-reorder"/.test(screen));
  check(`${name} keeps no timer of its own`, !/setTimeout/.test(screen));
  check(`${name} keeps no move logic of its own`, !/movePhotoEarlier|movePhotoLater/.test(screen));
  check(`${name} says the same thing`, /PhotoOrderBar/.test(screen) && /PhotoArrangeView/.test(screen));
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
check("each plate shows the number it will print as", /photoReference\(index\)/.test(arrangeView));
check(
  "and the view says how to move a plate",
  /Press and hold a photograph, then drop it on another to swap the two/.test(arrangeView),
);
check(
  "captions travel with the photograph, not the position",
  /photoId=\{photo\.id\}/.test(grid) && /caption=\{photo\.caption\}/.test(grid),
);


console.log("\n8b. The drag is a maintained library, not a third hand-written gesture");

// Two hand-written versions came before this - arrows, then a custom
// long-press pointer drag - and the second felt wrong on a real iPhone. A
// photograph that does not visibly lift and follow the finger reads as a
// broken tap, and fixing that properly means an overlay, neighbours that move
// aside, auto-scroll at the edges and a delay that tells a drag from a scroll.
const dependencies = JSON.parse(read("../package.json")).dependencies;

// dnd-kit core alone: the sortable package went with the insertion behaviour
// it existed to provide.
check("the drag is a maintained library", Boolean(dependencies["@dnd-kit/core"]));
check("and the sortable list it no longer needs is gone", !dependencies["@dnd-kit/sortable"]);
check(
  "no hand-written gesture is left behind",
  !/elementFromPoint|setPointerCapture|passive: false/.test(arrangeView) &&
    !/elementFromPoint|setPointerCapture|usePhotoDrag/.test(control),
);
check(
  "a finger has to hold still first, so the grid can still be scrolled",
  /TouchSensor, \{ activationConstraint: \{ delay: \d+, tolerance: \d+ \} \}/.test(arrangeView),
);
check(
  "and a mouse simply drags",
  /MouseSensor, \{ activationConstraint: \{ distance: \d+ \} \}/.test(arrangeView),
);
// One sensor covering both inputs claims a touch before the hold above can be
// judged, so a press-and-hold did nothing and a swipe started a drag the
// browser then cancelled. Two sensors, one rule each.
check(
  "and the two are separate sensors, not one that covers both",
  !/useSensor\(PointerSensor/.test(arrangeView),
);
check(
  "touch-action lets a swipe through until the hold takes the gesture",
  /touchAction: "manipulation"/.test(arrangeView),
);
check(
  "the lifted photograph is a real tile following the finger",
  /<DragOverlay/.test(arrangeView),
);
// The grid stands still. An insertion-style sortable reflows every tile
// between the two, which is what made a drag feel like it had taken the report
// apart. Here the only things that change before the drop are the lifted
// tile's opacity and the highlight on the one under the finger.
check(
  "nothing reflows: the tiles are droppables, not a sortable list",
  /useDroppable/.test(arrangeView) &&
    /useDraggable/.test(arrangeView) &&
    !/SortableContext|rectSortingStrategy|useSortable/.test(arrangeView),
);
check(
  "the tile it is over lights up, so the swap is obvious before the drop",
  /isOver && !isDragging/.test(arrangeView) && /border-brand/.test(arrangeView),
);
check(
  "and the one it came from is dimmed where it stands",
  /opacity: isDragging \? 0\.35 : 1/.test(arrangeView),
);
check(
  "no tile is ever transformed, so the grid cannot shuffle under a finger",
  !/CSS\.Transform/.test(arrangeView),
);
check(
  "the view owns its scrolling, which is what lets it auto-scroll",
  /overflow-y-auto/.test(arrangeView) && /overscroll-contain/.test(arrangeView),
);
check("a keyboard can still move a plate", /KeyboardSensor/.test(arrangeView));
check(
  "it is a screen of its own rather than controls sprinkled on the report",
  /createPortal/.test(arrangeView) && /fixed inset-0/.test(arrangeView),
);
check("with a way out", /onDone/.test(arrangeView) && /Escape/.test(arrangeView));
check(
  "one implementation, used by every document kind",
  /PhotoArrangeView/.test(grid) &&
    /PhotoArrangeView/.test(read("../components/summary-reports/report-photos.tsx")),
);
check(
  "the order it produces goes through the same debounced save as before",
  /order\.swap\(/.test(arrangeView) && /usePhotoOrder/.test(control),
);
check(
  "and the swap happens on the drop, not while the finger moves",
  /function onDragEnd[\s\S]{0,400}order\.swap\(/.test(arrangeView) &&
    !/onDragOver/.test(arrangeView),
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
