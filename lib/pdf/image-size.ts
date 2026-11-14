/**
 * The intrinsic size of a photograph, read from its own bytes.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * This exists to stop portrait photographs looking like an accident. Every
 * plate used to be printed into a box of one fixed height, so a landscape shot
 * filled it and a portrait one shrank to a narrow strip with half the column
 * empty either side - on a site where most defect photographs are taken
 * portrait on a phone. Knowing the aspect ratio lets a tall photograph be
 * given a taller box, so both read as deliberate.
 *
 * Header parsing only: a few dozen bytes are inspected and nothing is decoded,
 * re-encoded or resized. The image data written into the PDF is byte-for-byte
 * what was uploaded.
 */

export type ImageSize = { width: number; height: number };

/** JPEG frame markers that carry the dimensions. SOF4, SOF8 and SOF12 are not frames. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readPng(bytes: Uint8Array): ImageSize | null {
  // \x89PNG\r\n\x1a\n, then a 13-byte IHDR whose first two fields are the size.
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Resynchronise rather than give up: a stray fill byte is legal.
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // Padding and the standalone markers carry no length field.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      // ...marker, length, precision, then height before width.
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array): ImageSize | null {
  // RIFF....WEBP, then one of three chunk layouts.
  if (bytes.length < 30) return null;
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const format = tag(12);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "VP8X") {
    // Three-byte little-endian, stored as one less than the true dimension.
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  if (format === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (format === "VP8 ") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  return null;
}

/**
 * The photograph's own dimensions, or null when the format is one this does
 * not read. Null is a normal answer, not a failure - the caller falls back to
 * a sensible default box and the photograph still prints.
 */
export function imageSize(data: Uint8Array | null | undefined): ImageSize | null {
  if (!data || data.length < 24) return null;
  const size = readPng(data) ?? readJpeg(data) ?? readWebp(data);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}

/** Landscape and square photographs. Everything unknown is treated as landscape. */
export const DEFAULT_ASPECT = 4 / 3;

/**
 * How tall to print one photograph inside a column of `columnWidth` points.
 *
 * The width is fixed by the two-column grid, so the only lever is height. A
 * landscape plate takes the height its own shape asks for; a portrait one is
 * capped, because a phone photograph printed at its true ratio in a 250pt
 * column would be over 400pt tall and two of them would own a page. The floor
 * stops a panorama becoming a letterbox strip.
 *
 * Deterministic: the same photograph in the same column always produces the
 * same height, so a report re-rendered from the same data paginates the same
 * way.
 */
export function photoBoxHeight(
  size: ImageSize | null,
  columnWidth: number,
  { min = 110, max = 190 }: { min?: number; max?: number } = {},
): number {
  const aspect = size && size.height > 0 ? size.width / size.height : DEFAULT_ASPECT;
  const natural = columnWidth / (aspect > 0 ? aspect : DEFAULT_ASPECT);
  return Math.round(Math.min(max, Math.max(min, natural)));
}

/**
 * The printed size of one plate: the box height above, and the width the
 * photograph actually occupies at that height.
 *
 * The frame is drawn at this size rather than at the full column width, so a
 * portrait photograph is a portrait plate instead of a landscape box with grey
 * bars either side of it. Nothing is cropped - the width follows from the
 * height and the photograph's own ratio.
 */
export function photoBoxSize(
  size: ImageSize | null,
  columnWidth: number,
  bounds?: { min?: number; max?: number },
): { width: number; height: number } {
  const height = photoBoxHeight(size, columnWidth, bounds);
  const aspect = size && size.height > 0 ? size.width / size.height : DEFAULT_ASPECT;
  return { width: Math.min(columnWidth, Math.round(height * aspect)), height };
}

/**
 * The largest a photograph can be printed inside a box without being cropped,
 * stretched or letterboxed.
 *
 * Used by the cover image, where the space is a wide band rather than a
 * column: the photograph is scaled to fit inside both bounds and keeps its own
 * ratio exactly, so a portrait shot chosen as a cover comes out tall and
 * narrow rather than squashed into a strip. Nothing is cropped, for the same
 * reason nothing is cropped on a plate - a crop can remove the very thing the
 * photograph was taken for.
 */
export function fitBox(
  size: ImageSize | null,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = size && size.height > 0 ? size.width / size.height : DEFAULT_ASPECT;
  const aspect = ratio > 0 ? ratio : DEFAULT_ASPECT;
  const width = Math.min(maxWidth, maxHeight * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}

/** True where the photograph is taller than it is wide. */
export function isPortrait(size: ImageSize | null): boolean {
  return size !== null && size.height > size.width;
}
