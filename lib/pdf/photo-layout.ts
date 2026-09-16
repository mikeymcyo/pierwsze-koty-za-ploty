/**
 * How the photographic plates are arranged on the page.
 *
 * Pure, with no runtime imports and no path aliases, so the arithmetic can be
 * tested without a renderer, and so the picker on the finalise screen can
 * import it without dragging the PDF renderer into the browser bundle.
 *
 * The grid used to be two fixed columns with every plate capped at 190pt tall,
 * whatever the photograph. On a site where most pictures are taken portrait on
 * a phone that is the worst case: a 2:3 photograph in a 238pt column wants to
 * be 357pt tall, is cut to 190, and therefore prints 127pt wide - leaving
 * nearly half the column empty either side of it. Six of those to a page fill
 * about two fifths of the paper, and the client reads a report of small
 * pictures surrounded by white.
 *
 * Two arrangements, and no more. A page designer is the wrong answer to this:
 * a site manager finishing a report at five o'clock wants the photographs to
 * look right, not a layout tool. So the count and the shape of the
 * photographs decide the arrangement, and the only choice offered is which of
 * two intentions applies.
 *
 * Nothing here crops, scales or re-encodes anything. It decides how wide a
 * column is and how tall a plate may be; the photograph is then fitted inside
 * that box at its own aspect ratio by lib/pdf/image-size.ts, and the bytes
 * written into the PDF are the bytes that were uploaded.
 */

export const PHOTO_LAYOUTS = ["standard", "focus"] as const;

export type PhotoLayout = (typeof PHOTO_LAYOUTS)[number];

export const DEFAULT_PHOTO_LAYOUT: PhotoLayout = "standard";

export const PHOTO_LAYOUT_LABELS: Record<PhotoLayout, string> = {
  standard: "Standard",
  focus: "Photo focus",
};

/** One line each, so the choice is made from what it does rather than its name. */
export const PHOTO_LAYOUT_DESCRIPTIONS: Record<PhotoLayout, string> = {
  standard: "The report as usual, with the photographs filling the page properly.",
  focus: "The photographs given the page - one or two large plates at a time.",
};

export function isPhotoLayout(value: string | null | undefined): value is PhotoLayout {
  return PHOTO_LAYOUTS.includes(value as PhotoLayout);
}

/**
 * The layout a form field or query parameter asked for.
 *
 * Anything unrecognised falls back to Standard rather than failing: a mistyped
 * URL must not stop a report being issued.
 */
export function photoLayoutOf(value: string | null | undefined): PhotoLayout {
  return isPhotoLayout(value) ? value : DEFAULT_PHOTO_LAYOUT;
}

// ---------------------------------------------------------------------------
// The page, in points
// ---------------------------------------------------------------------------

/** A4 less the two 40pt page margins. Kept in step with CONTENT_WIDTH. */
const CONTENT_WIDTH = 515;

/** The gutter every cell keeps to its right, and the frame's border and padding. */
const CELL_GUTTER = 12;
const FRAME_CHROME = 5;

/**
 * The room one page actually has for plates.
 *
 * Measured, not derived. A4 less the page padding is 764pt, but the fixed
 * header and footer take a little of that, and two full-width plates sized
 * from the arithmetic figure came out one to a page - each wasting half a
 * sheet. Rendering eight plates at descending heights put the real boundary
 * between a 368pt row (two to a page) and a 373pt row (one), so the figure
 * used here is the conservative end of that bracket. See the note in
 * e2e/pdf-export-smoke.mjs, which re-measures it.
 */
export const USABLE_PAGE_HEIGHT = 736;

/** Reference line, frame, caption box and the room below the row. */
export const PLATE_CHROME_HEIGHT = 58;

/** How wide one photograph may be printed when the row has this many columns. */
export function columnWidthFor(columns: number): number {
  return Math.floor(CONTENT_WIDTH / Math.max(1, columns)) - CELL_GUTTER - FRAME_CHROME;
}

/**
 * The tallest a plate is printed in Standard.
 *
 * Measured against the renderer rather than chosen: two rows of this height
 * must still share a page, which allows 310, and 300 is the round number
 * under it. It is more than half as tall again as the 190 this replaced,
 * which is where the portrait photographs get their size back.
 *
 * Standard deliberately does NOT widen a plate to the full page. A full-width
 * plate is a wide plate and therefore a tall one, and these documents are
 * text with photographs rather than photograph albums: rendered against the
 * real fixtures, a single full-width plate pushed a one-photograph Daily and
 * a one-plate Progress Report onto a second page at every height worth
 * having. Those two reports being one page each is an invariant that predates
 * this change. Photo focus is where the page is given over to the pictures,
 * and choosing it is how somebody asks for that.
 */
const STANDARD_MAX = 300;

/**
 * Photo focus: a tall photograph takes the page, a wide one shares it with
 * one other. Past the Standard cap on purpose - somebody who picks this is
 * asking for the pages.
 */
const FOCUS_TALL_MAX = 560;
const FOCUS_WIDE_MAX = STANDARD_MAX;

export type PhotoShape = {
  /** Taller than it is wide, measured after any rotation has been applied. */
  portrait: boolean;
};

export type PhotoRowPlan = {
  /** Indices into the photographs as supplied, in order. Order is never changed. */
  indexes: number[];
  /** The width the photograph is fitted into. */
  columnWidth: number;
  /** The share of the row one plate's cell takes. */
  cellWidth: string;
  /** Whether the plate is centred in its cell, which a lone one always is. */
  centred: boolean;
  /** The height bounds for the plates in this row. */
  bounds: { min: number; max: number };
};

function pair(indexes: number[], min: number): PhotoRowPlan {
  // A photograph left over at the end of a row is centred at the same size as
  // a pair rather than stranded against the left margin with a hole beside
  // it. Same height, so it costs the document nothing.
  const lone = indexes.length === 1;
  return {
    indexes,
    columnWidth: columnWidthFor(2),
    cellWidth: lone ? "100%" : "50%",
    centred: lone,
    bounds: { min, max: STANDARD_MAX },
  };
}

function wide(index: number, min: number, max: number): PhotoRowPlan {
  return {
    indexes: [index],
    columnWidth: columnWidthFor(1),
    cellWidth: "100%",
    centred: true,
    bounds: { min, max },
  };
}

/**
 * The rows of plates, in the order the photographs were given.
 *
 * `min` is the floor the style asks for and is passed straight through: it is
 * the one bound this does not touch, because raising it is what squashes a
 * panorama.
 *
 * Standard arranges one, two, three or four photographs by shape - a single
 * photograph across the page, a pair of landscapes stacked full width rather
 * than shrunk into two columns, three as a pair and a full-width third - and
 * settles into two columns beyond that, where the win comes from the cap
 * rather than the arrangement.
 *
 * Photo focus gives every photograph the full width of the page and lets its
 * shape decide the height: a tall photograph takes the page, a wide one
 * shares it with one other. There is nothing to choose and nothing to drag.
 */
export function planPhotoRows(
  shapes: readonly PhotoShape[],
  layout: PhotoLayout = DEFAULT_PHOTO_LAYOUT,
  min = 110,
): PhotoRowPlan[] {
  const count = shapes.length;
  if (count === 0) return [];

  // Photo focus: one photograph to a row, every time. The shape chooses the
  // cap, so a portrait plate owns the page and two landscapes share one.
  if (layout === "focus") {
    return shapes.map((shape, index) =>
      wide(index, min, shape.portrait ? FOCUS_TALL_MAX : FOCUS_WIDE_MAX),
    );
  }

  const rows: PhotoRowPlan[] = [];
  for (let index = 0; index < count; index += 2) {
    rows.push(pair(index + 1 < count ? [index, index + 1] : [index], min));
  }
  return rows;
}

/**
 * The share of a page's area the plates cover, for a set of identical
 * photographs. Used by the tests to prove an arrangement genuinely fills the
 * paper better rather than merely differently.
 */
export function pageFill(
  plate: { width: number; height: number },
  perPage: number,
): number {
  return (plate.width * plate.height * perPage) / (CONTENT_WIDTH * USABLE_PAGE_HEIGHT);
}
