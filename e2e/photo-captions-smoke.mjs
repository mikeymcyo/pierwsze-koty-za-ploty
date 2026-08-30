/**
 * What gets printed under a photograph.
 *
 * The bug this guards: every photograph printed its category in capitals, so a
 * report with twelve site photographs said PROGRESS twelve times and told the
 * client nothing. Needs neither Supabase nor a dev server.
 */
import { readFileSync } from "node:fs";

import {
  PHOTO_STATUSES,
  UNSET_PHOTO_STATUS,
  photoPickerLabel,
  photoStatusLabel,
  PHOTO_STATUS_LABELS,
  RETIRED_PHOTO_STATUSES,
  photoPrintLabel,
  photoPrintLabelText,
} from "../lib/photo-captions.ts";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. The status menu is the six the site manager asked for");
const labels = PHOTO_STATUSES.map((status) => status.label);
check(
  // "No status" leads, because it is the answer for most photographs and the
  // one a new upload starts on. Twenty-five ordinary site photographs should
  // not arrive carrying twenty-five labels nobody chose.
  "No status, Before, During, After, Defect, Delivery - in that order",
  labels.join(",") === "No status,Before,During,After,Defect,Delivery",
  labels.join(","),
);
check(
  "every one maps to a value the photo_category enum already has",
  PHOTO_STATUSES.every((status) =>
    ["before", "progress", "after", "defect", "delivery", "general", "work_completed", "safety"].includes(
      status.value,
    ),
  ),
  JSON.stringify(PHOTO_STATUSES.map((s) => s.value)),
);
check("\"During\" is the enum's progress, so no migration is needed",
  PHOTO_STATUSES.find((s) => s.label === "During")?.value === "progress");
check("\"No status\" is the enum's general, so it needs no migration",
  PHOTO_STATUSES.find((s) => s.label === "No status")?.value === "general");
check("and it is what the menu starts on", PHOTO_STATUSES[0].value === UNSET_PHOTO_STATUS);
check(
  "nothing offers a status called Other any more - it printed nothing anyway",
  !labels.includes("Other"),
);

console.log("\n2. A custom caption is what the client reads");
const captioned = photoPrintLabel({ caption: "New brickwork to east elevation", category: "progress" });
check("the caption survives verbatim", captioned.caption === "New brickwork to east elevation");
check("and the status stands beside it", captioned.status === "During", String(captioned.status));
check(
  "a blank caption is not printed as an empty line",
  photoPrintLabel({ caption: "   ", category: "before" }).caption === null,
);

console.log("\n3. The repetitive generic label is gone");
check(
  "an unmarked, uncaptioned photograph prints nothing at all",
  photoPrintLabel({ caption: null, category: "general" }).status === null &&
    photoPrintLabel({ caption: null, category: "general" }).caption === null,
);
check(
  "an unmarked photograph with a caption prints only the caption",
  photoPrintLabel({ caption: "Site compound", category: "general" }).status === null,
);
check(
  "but a status that means something is still printed",
  photoPrintLabel({ caption: null, category: "defect" }).status === "Defect",
);
check(
  "twelve During photographs with captions read as twelve captions, not twelve labels",
  Array.from({ length: 12 }, (_, i) =>
    photoPrintLabelText({ caption: `Bay ${i + 1}`, category: "progress" }),
  ).every((text, i) => text === `During - Bay ${i + 1}`),
);

console.log("\n4. Photographs stored before this menu existed still work");
check(
  "work_completed keeps its own words rather than being blanked",
  photoPrintLabel({ caption: null, category: "work_completed" }).status === "Work completed",
);
check(
  "so does safety",
  photoPrintLabel({ caption: null, category: "safety" }).status === "Safety",
);
check(
  "both retired values are still labelled",
  RETIRED_PHOTO_STATUSES.every((status) => PHOTO_STATUS_LABELS[status.value]),
);
check(
  "an old photograph's caption is untouched",
  photoPrintLabel({ caption: "Made good", category: "work_completed" }).caption === "Made good",
);
check(
  "a value nobody recognises does not throw, it just prints no status",
  photoPrintLabel({ caption: "Something", category: "not_a_real_category" }).status === null,
);

console.log("\n5. The one-line form, for alt text and pickers");
check(
  "status and caption together",
  photoPrintLabelText({ caption: "Slab pour", category: "after" }) === "After - Slab pour",
);
check(
  "caption alone when the status says nothing",
  photoPrintLabelText({ caption: "Slab pour", category: "general" }) === "Slab pour",
);
check(
  "status alone when there is no caption",
  photoPrintLabelText({ caption: null, category: "before" }) === "Before",
);
check(
  "and null when there is nothing worth saying",
  photoPrintLabelText({ caption: null, category: "general" }) === null,
);

console.log("\nA status is opted into, not assigned");

const uiRead = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// The fault: every upload was tagged "During" unless somebody changed the
// menu, so twenty-five ordinary site photographs arrived carrying twenty-five
// DURING labels nobody had chosen.
const uploader = uiRead("../components/reports/photo-upload.tsx");
check(
  "a new photograph starts with no status",
  /defaultCategory = UNSET_PHOTO_STATUS/.test(uploader),
);
check("and nothing defaults it to During", !/defaultCategory = "progress"/.test(uploader));
check("the menu says the status is optional", /Status \(optional\)/.test(uploader));

// Nothing displays a status that was never chosen - not the grid, not the
// pickers, not the AI's context, not the PDF.
check("an unmarked photograph has no status to show", photoStatusLabel("general") === null);
for (const [value, label] of [
  ["before", "Before"],
  ["progress", "During"],
  ["after", "After"],
  ["defect", "Defect"],
  ["delivery", "Delivery"],
]) {
  check(`a photograph marked ${label} still shows it`, photoStatusLabel(value) === label);
}
// Values stored before the menu shrank keep their own words.
check("work_completed keeps showing its own", photoStatusLabel("work_completed") === "Work completed");
check("and safety keeps showing its own", photoStatusLabel("safety") === "Safety");
check("an unknown value shows nothing rather than throwing", photoStatusLabel("invented") === null);

check(
  "a picker names an unmarked, uncaptioned photograph rather than showing a blank",
  photoPickerLabel({ caption: null, category: "general" }, "Photograph") === "Photograph",
);
check(
  "and prefers what the site manager wrote",
  photoPickerLabel({ caption: "Slab pour", category: "general" }, "Photograph") === "Slab pour",
);
check(
  "and keeps a chosen status alongside it",
  photoPickerLabel({ caption: "Slab pour", category: "defect" }, "Photograph") === "Defect - Slab pour",
);

// Every screen that shows a status goes through one of the two helpers, so an
// unmarked photograph is unmarked everywhere.
for (const [what, path] of [
  ["the photo grid", "../components/reports/photo-grid.tsx"],
  ["the report photo workspace", "../components/summary-reports/report-photos.tsx"],
  ["the curation picker", "../components/summary-reports/summary-curation.tsx"],
  ["the daily screen", "../app/(app)/reports/[id]/page.tsx"],
  ["the project screen", "../app/(app)/projects/[id]/page.tsx"],
  ["the issue screen", "../app/(app)/issues/[id]/page.tsx"],
]) {
  const source = uiRead(path);
  check(
    `${what} never prints a raw category label`,
    !/PHOTO_CATEGORY_LABELS\[|PHOTO_STATUS_LABELS\[/.test(source),
    path,
  );
}
check(
  "the AI is told nothing where nothing was chosen",
  /statusLabel: photoStatusLabel\(photo\.category\)/.test(
    uiRead("../app/(app)/reports/photo-actions.ts"),
  ),
);
check(
  "and captioning does not depend on a status being set",
  !/statusLabel[^\n]*\?\?/.test(uiRead("../app/(app)/reports/photo-actions.ts")),
);

// Nothing about stored data changed, so no migration and no issued document
// says anything different from what it said.
check(
  "no new stored value was needed - general already printed nothing",
  UNSET_PHOTO_STATUS === "general",
);

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PHOTO CAPTION CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
