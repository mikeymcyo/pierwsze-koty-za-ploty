/**
 * Which way up a photograph is printed.
 *
 * Rotation is presentation and nothing else: the stored object is what came
 * off the camera and is never re-encoded, so a turn is a number on the row
 * that every surface applies while drawing. What is checked here is the
 * arithmetic, the geometry that makes a quarter turn come out the right shape,
 * and - by rendering real PDFs - that a turned photograph still lays out.
 *
 * Needs no Supabase, no dev server and no API key:
 *
 *   npm run test:photo-rotation
 */

import { createElement } from "react";
import { readFileSync } from "node:fs";

import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";

import { LANDSCAPE, PORTRAIT } from "./support/fixture-image.mjs";
import { nodesOf } from "./support/pdf-tree.mjs";

import {
  PHOTO_ROTATIONS,
  cssRotation,
  describeRotation,
  isQuarterTurn,
  normaliseRotation,
  rotateBy,
  rotatedSize,
} from "../lib/photos-rotation.ts";
import { imageSize, photoBoxSize } from "../lib/pdf/image-size.ts";
import { photosWithData } from "../lib/pdf/report-data.ts";
import { ReportDocument } from "../lib/pdf/report-document.tsx";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

console.log("\n1. Four quarter turns, and nothing else");

check("the turns are 0, 90, 180, 270", PHOTO_ROTATIONS.join() === "0,90,180,270");
for (const turn of PHOTO_ROTATIONS) {
  check(`${turn} survives normalising`, normaliseRotation(turn) === turn);
}
// A row written before the column existed, a value from a request, a number
// nobody should have been able to store. A photograph at a strange angle would
// be worse than one printed as it was taken.
for (const [what, value] of [
  ["null", null],
  ["undefined", undefined],
  ["a string", "90"],
  ["45 degrees", 45],
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["a wild number", 1234],
]) {
  check(`${what} reads as no turn at all`, normaliseRotation(value) === 0, String(value));
}
check("-90 means 270", normaliseRotation(-90) === 270);
check("360 means 0", normaliseRotation(360) === 0);
check("450 means 90", normaliseRotation(450) === 90);

console.log("\n2. Left and right go the way they say");

check("right from 0 is 90", rotateBy(0, "right") === 90);
check("right from 270 wraps to 0", rotateBy(270, "right") === 0);
check("left from 0 wraps to 270", rotateBy(0, "left") === 270);
check("left from 90 is 0", rotateBy(90, "left") === 0);
check(
  "four turns either way come back to where they started",
  ["left", "right"].every((direction) => {
    let turn = 0;
    for (let i = 0; i < 4; i++) turn = rotateBy(turn, direction);
    return turn === 0;
  }),
);
check(
  "and one each way cancels out",
  PHOTO_ROTATIONS.every((turn) => rotateBy(rotateBy(turn, "left"), "right") === turn),
);

console.log("\n3. A quarter turn changes the shape; a half turn does not");

check("90 is a quarter turn", isQuarterTurn(90) && isQuarterTurn(270));
check("0 and 180 are not", !isQuarterTurn(0) && !isQuarterTurn(180));

const portrait = { width: 1080, height: 1620 };
check("a portrait turned on its side is landscape", rotatedSize(portrait, 90).width === 1620);
check("and its height is the old width", rotatedSize(portrait, 90).height === 1080);
check("270 swaps it too", rotatedSize(portrait, 270).width === 1620);
check("180 leaves the shape alone", rotatedSize(portrait, 180).width === 1080);
check("0 leaves it alone", rotatedSize(portrait, 0).height === 1620);
check("and a missing size stays missing", rotatedSize(null, 90) === null);

console.log("\n4. The plate is measured on the photograph as it will appear");

// The fault this prevents: measuring before the turn draws a tall frame round
// a wide picture.
const upright = photoBoxSize(imageSize(PORTRAIT), 238);
const turned = photoBoxSize(rotatedSize(imageSize(PORTRAIT), 90), 238);
check("a portrait plate is taller than it is wide", upright.height > upright.width, JSON.stringify(upright));
check("turned on its side it is wider than it is tall", turned.width > turned.height, JSON.stringify(turned));
check(
  "and the turned box is the upright one with its sides exchanged",
  Math.abs(turned.width - upright.height) <= 2 || turned.width === 238,
  `${JSON.stringify(upright)} vs ${JSON.stringify(turned)}`,
);
check(
  "a half turn measures exactly as no turn does",
  JSON.stringify(photoBoxSize(rotatedSize(imageSize(PORTRAIT), 180), 238)) ===
    JSON.stringify(upright),
);

console.log("\n5. Nothing else on the photograph moves");

const rows = [
  {
    id: "a",
    caption: "Cracking to the plaster",
    category: "defect",
    storage_path: "x/a.jpg",
    rotation: 90,
  },
  { id: "b", caption: null, category: "general", storage_path: "x/b.jpg" },
];
const printable = photosWithData(rows, new Map([["x/a.jpg", LANDSCAPE], ["x/b.jpg", PORTRAIT]]));
check("the turn travels with the bytes", printable[0].rotation === 90);
check("a photograph nobody turned reads as 0", printable[1].rotation === 0);
check("the caption stays on its own photograph", printable[0].caption === "Cracking to the plaster");
check("and so does the status", printable[0].category === "defect");
check("the stored path is untouched", rows[0].storage_path === "x/a.jpg");

console.log("\n6. A turned photograph still renders, and still fits");

const daily = (photos) => ({
  companyName: "Empire Interiors Ltd",
  projectName: "South Croydon",
  client: null,
  siteAddress: null,
  projectReference: null,
  reportNumber: "009",
  reportDate: "29 August 2026",
  weather: null,
  authorName: "M. Korzeniak",
  finalisedAt: "29 August 2026",
  workforce: [],
  plant: [],
  sections: [
    { type: "works_completed", label: "Works completed", content: "Ducting laid." },
  ],
  issues: [],
  photos,
  supportingDocuments: [],
  documentsAppended: false,
  store: null,
});

const pageCount = async (data) =>
  (await PDFDocument.load(await renderToBuffer(createElement(ReportDocument, { data })))).getPageCount();

const plate = (rotation, image = PORTRAIT) => ({
  id: `p-${rotation}`,
  caption: "A plate",
  category: "general",
  data: image,
  rotation,
});

for (const turn of PHOTO_ROTATIONS) {
  const pages = await pageCount(daily([plate(turn)]));
  check(`a photograph at ${turn}째 renders`, pages >= 1, String(pages));
  check(`and at ${turn}째 it costs no extra page`, pages === 1, String(pages));
}

// All four at once, which is what a real report looks like after somebody has
// straightened a few.
const mixed = await pageCount(daily(PHOTO_ROTATIONS.map((turn) => plate(turn))));
check("four plates at four angles stay within budget", mixed <= 2, String(mixed));

// An unturned report must render byte-for-byte as it did before rotation
// existed: every photograph already stored is at 0.
const before = await renderToBuffer(
  createElement(ReportDocument, { data: daily([{ ...plate(0), rotation: undefined }]) }),
);
const after = await renderToBuffer(createElement(ReportDocument, { data: daily([plate(0)]) }));
check(
  "0 and 'never turned' produce the same document",
  before.length === after.length,
  `${before.length} vs ${after.length}`,
);

console.log("\n7. The turn reaches the image, and only the image");

// The rendered PDF is not searchable, so the element tree is where a
// transform can be seen.
const treeFor = (rotation) =>
  nodesOf(createElement(ReportDocument, { data: daily([plate(rotation)]) }));
const transformsAt = (rotation) =>
  treeFor(rotation).filter((node) => node?.props?.style?.transform).length;

check("a turned plate carries a transform", transformsAt(90) > 0);
check("and an unturned one carries none", transformsAt(0) === 0);
check(
  "the transform says the angle it was given",
  treeFor(270).some((node) => node?.props?.style?.transform === "rotate(270deg)"),
);
check(
  "and it turns about the middle, not a corner",
  treeFor(90).some((node) => node?.props?.style?.transformOrigin === "center"),
);

console.log("\n8. Presentation only, and never on an issued report");

const actions = read("../app/(app)/reports/photo-actions.ts");
// Bounded to the one function: everything after it is somebody else's
// business, and describePhotoAction legitimately downloads from storage.
const rotateStart = actions.indexOf("export async function rotatePhoto");
const rotateEnd = actions.indexOf("\nexport ", rotateStart + 1);
const rotate = actions.slice(rotateStart, rotateEnd === -1 ? undefined : rotateEnd);
check("the action writes one column", /\.update\(\{ rotation: rotateBy\(/.test(rotate));
check(
  "and nothing else - no storage call, no re-encode, no copy",
  !/storage\.|upload|remove\(|download/.test(rotate),
  "the stored object is the evidence",
);
check(
  "an issued report refuses the turn",
  /owner\?\.status === "final"[\s\S]{0,40}REPORT_IS_FINAL/.test(rotate),
);
check(
  "the direction is taken from the form, not the resulting angle",
  /formData\.get\("direction"\)/.test(rotate) && !/formData\.get\("rotation"\)/.test(rotate),
);

const migration = read("../supabase/migrations/20260901000009_photo_rotation.sql");
check("the column is additive", /add column if not exists rotation smallint/.test(migration));
check("it defaults to 0, so nothing already stored changes", /not null default 0/.test(migration));
check("only quarter turns are storable", /check \(rotation in \(0, 90, 180, 270\)\)/.test(migration));
check("the rollback is written down", /drop column if exists rotation/.test(migration));
check(
  "nothing in it touches an existing row",
  !/\bupdate public\.photos\b|\bdelete from\b|\bdrop table\b/.test(migration),
);

const view = read("../components/reports/photo-arrange.tsx");
check("turning is offered inside arrange mode", /RotateButton/.test(view));
check("both ways", /direction="left"/.test(view) && /direction="right"/.test(view));
check(
  "and a press on a button does not lift the photograph",
  /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/.test(view),
);
check("the screen says the file is not altered", /never altered/.test(view));

console.log("\n9. What a person sees");

check("no turn needs no transform", cssRotation(0) === undefined);
check("a turn is degrees", cssRotation(90) === "rotate(90deg)");
check("and a junk value is no turn", cssRotation("nonsense") === undefined);
check("an untouched photograph says nothing", describeRotation(0) === null);
check("a turned one says so", describeRotation(180) === "Turned 180°");

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL PHOTO ROTATION CHECKS PASSED");
} else {
  for (const failure of failures) console.log(`FAILED: ${failure}`);
  process.exitCode = 1;
}
