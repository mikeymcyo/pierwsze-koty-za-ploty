/**
 * Which way up a photograph is printed.
 *
 * Pure, with no runtime imports and no path aliases, so the arithmetic can be
 * tested without a database, a renderer or a phone.
 *
 * ## Presentation, never the file
 *
 * A site photograph is evidence. The object in storage is what came off the
 * camera and it is never rewritten, re-encoded or copied - rotating one
 * records a quarter turn against the row and every surface applies it while
 * drawing. That keeps the original exactly as it was taken, which is the whole
 * point of storing it, and it means a rotation can be undone by rotating back
 * rather than by hoping a re-encode was lossless.
 *
 * Everything else on the row - the caption, the status, the AI description -
 * belongs to the same row and follows the photograph without being touched.
 *
 * ## Zero is what every existing photograph is
 *
 * The column defaults to 0 and 0 means "as uploaded", so every photograph
 * taken before this existed prints exactly as it printed yesterday.
 */

export const PHOTO_ROTATIONS = [0, 90, 180, 270] as const;

export type PhotoRotation = (typeof PHOTO_ROTATIONS)[number];

/**
 * A stored value made safe to draw with.
 *
 * Anything unexpected - null from a row written before the column existed, a
 * number nobody should have been able to store, a value from a request - comes
 * back as one of the four quarter turns. A photograph printed at a strange
 * angle would be worse than one printed as it was taken.
 */
export function normaliseRotation(value: unknown): PhotoRotation {
  const degrees = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  // Two modulos: the first can be negative, and -90 has to mean 270.
  const wrapped = (((degrees % 360) + 360) % 360) as number;
  return (PHOTO_ROTATIONS as readonly number[]).includes(wrapped)
    ? (wrapped as PhotoRotation)
    : 0;
}

export type RotationDirection = "left" | "right";

/** One quarter turn from where it is now. */
export function rotateBy(value: unknown, direction: RotationDirection): PhotoRotation {
  const from = normaliseRotation(value);
  return normaliseRotation(direction === "left" ? from - 90 : from + 90);
}

/**
 * Whether the turn puts the photograph on its side, which is the case that
 * changes its shape rather than just its content.
 */
export function isQuarterTurn(value: unknown): boolean {
  const rotation = normaliseRotation(value);
  return rotation === 90 || rotation === 270;
}

export type Size = { width: number; height: number };

/**
 * The size a rotated photograph actually occupies.
 *
 * A quarter turn swaps width and height, and everything that lays a photograph
 * out has to know: a portrait shot turned on its side is a landscape plate,
 * and a layout that measured it before the turn would draw a tall box round a
 * wide picture. Half turns and no turn leave the shape alone.
 */
export function rotatedSize<T extends Size | null>(size: T, rotation: unknown): T {
  if (!size || !isQuarterTurn(rotation)) return size;
  return { ...size, width: size.height, height: size.width } as T;
}

/** What the browser is told, and nothing when there is no turn to make. */
export function cssRotation(value: unknown): string | undefined {
  const rotation = normaliseRotation(value);
  return rotation === 0 ? undefined : `rotate(${rotation}deg)`;
}

/** Said under a thumbnail somebody has turned, so it is not mistaken for the file. */
export function describeRotation(value: unknown): string | null {
  const rotation = normaliseRotation(value);
  return rotation === 0 ? null : `Turned ${rotation}°`;
}
