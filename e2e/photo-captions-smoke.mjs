/**
 * What gets printed under a photograph.
 *
 * The bug this guards: every photograph printed its category in capitals, so a
 * report with twelve site photographs said PROGRESS twelve times and told the
 * client nothing. Needs neither Supabase nor a dev server.
 */
import {
  PHOTO_STATUSES,
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
  "Before, During, After, Defect, Delivery, Other - in that order",
  labels.join(",") === "Before,During,After,Defect,Delivery,Other",
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
check("\"Other\" is the enum's general",
  PHOTO_STATUSES.find((s) => s.label === "Other")?.value === "general");

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
  "an uncaptioned Other photograph prints nothing at all",
  photoPrintLabel({ caption: null, category: "general" }).status === null &&
    photoPrintLabel({ caption: null, category: "general" }).caption === null,
);
check(
  "a captioned Other photograph prints only the caption",
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
  "work_completed keeps its own words rather than becoming Other",
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

console.log("\n=== Result ===");
if (failures.length === 0) console.log("ALL PHOTO CAPTION CHECKS PASSED");
else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
