/** Only the attempted photographs may leave the retry list. */
export function remainingPhotoRetries<T extends { id: string }>(
  previous: T[],
  attempted: T[],
  failed: T[],
): T[] {
  const attemptedIds = new Set(attempted.map((photo) => photo.id));
  return [...previous.filter((photo) => !attemptedIds.has(photo.id)), ...failed];
}
