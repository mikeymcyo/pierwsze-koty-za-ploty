/**
 * How a site photograph is resized and re-encoded before it is stored.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested directly rather than only through a browser.
 *
 * Two separate questions live here, and they were previously answered by one
 * line of canvas code each:
 *
 *  - how many pixels to keep, which is a print-resolution question; and
 *  - how to get down to them and how hard to compress, which is what decides
 *    whether a hairline crack in concrete still reads as a crack.
 *
 * Nothing downstream re-compresses: lib/pdf/image-size.ts parses headers only
 * and the PDF embeds the stored bytes byte for byte. So whatever this module
 * produces is exactly what a client sees in the exported report, and any
 * softness in a printed plate was introduced here.
 */

export type Size = { width: number; height: number };

/**
 * The longest edge a stored photo is allowed to have.
 *
 * A modern phone camera produces 4000px, 6 MB files. A plate in the report is
 * printed roughly 140-240pt wide, so 1600px is already 470-600 DPI on a plate
 * and about 280 DPI as a full-width cover - two to three times what an A4 page
 * can show, with room left for zooming into the PDF on screen. Going higher
 * buys nothing visible and costs upload time on one bar of signal, storage,
 * and egress every time the photograph is fetched again.
 *
 * Resolution has never been what made the plates look soft. Quality was.
 */
export const MAX_EDGE = 1600;

/**
 * JPEG quality for the stored photograph.
 *
 * This is a second generation of loss: the phone already encoded the file as
 * JPEG and this re-encodes it. 0.82 was low enough to land on the detail a
 * site photograph is taken for - fine texture, a hairline crack, a wet edge.
 *
 * It was never the main culprit, though, and the numbers say so. The photos
 * already in the bucket are 1200x1600 and 450-1150 kB, which is about three
 * bits a pixel - a generous bitrate, not a starved one. Measured against an
 * ideal downscale of the same scene, fixing the resampling below is worth
 * about 11 dB; moving quality from 0.82 to 0.90 is worth about 0.9 dB and
 * costs a fifth again in bytes on every fetch, for ever.
 *
 * So: 0.88, a small margin over the old value for the flat-but-detailed shot
 * that needs it. Because proper resampling removes the aliasing noise that
 * used to be encoded as if it were detail, a stored photograph comes out
 * around the size it does today rather than larger - which matters, because
 * the project is already close to its egress allowance.
 */
export const JPEG_QUALITY = 0.88;

/**
 * The size to store a photograph at: its own, unless it is bigger than
 * MAX_EDGE on its longest edge.
 *
 * Never upscales - a small photograph stays small rather than being
 * interpolated into a bigger, blurrier one - and keeps the aspect ratio, which
 * is what stops a plate being stretched.
 */
export function targetSize(source: Size, maxEdge: number = MAX_EDGE): Size {
  const longest = Math.max(source.width, source.height);
  if (!(longest > 0)) return { width: 0, height: 0 };

  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * The chain of sizes to draw through on the way down to `target`.
 *
 * A canvas resamples with a bilinear filter, which reads a small
 * neighbourhood of source pixels per destination pixel. Asking it to go from
 * 4032px to 1600px in one draw means most of the source pixels are never
 * sampled at all: the result is aliased and mushy in exactly the way the
 * report plates looked. Halving repeatedly until the last step is less than a
 * factor of two makes every source pixel contribute, which is what a proper
 * box filter would do.
 *
 * The last entry is always the target itself, so the chain is never empty and
 * a photograph that needs no scaling is drawn once at its own size.
 */
export function downscaleSteps(source: Size, target: Size): Size[] {
  const steps: Size[] = [];
  let width = source.width;
  let height = source.height;

  while (width >= target.width * 2 && height >= target.height * 2) {
    width = Math.max(target.width, Math.round(width / 2));
    height = Math.max(target.height, Math.round(height / 2));
    if (width <= target.width || height <= target.height) break;
    steps.push({ width, height });
  }

  steps.push({ width: target.width, height: target.height });
  return steps;
}

/**
 * The longest edge of the small copy the screens use.
 *
 * Nothing on any screen shows a photograph larger than a tile: two or three to
 * a row on a phone, an 80pt square in the cover picker. The largest of those is
 * about 200 CSS pixels, which on a phone at three device pixels each is 600.
 * 640 covers it with a little to spare and no visible softness.
 *
 * This is a preview and never evidence. The PDF is built from the original
 * object, which this does not touch.
 */
export const THUMB_EDGE = 640;

/**
 * Quality for that small copy.
 *
 * Lower than the stored photograph's, deliberately: at a sixth of the width, a
 * JPEG artefact is a sixth of the size too, and nobody inspects a crack in a
 * grid tile - they open the report. What matters here is the byte count, since
 * this is the file every screen fetches.
 */
export const THUMB_QUALITY = 0.72;
