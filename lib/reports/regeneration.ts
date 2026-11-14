/**
 * What a regeneration is allowed to touch, and what it tells the user afterwards.
 *
 * Pure, with no runtime imports and no path aliases, so both the server action
 * that applies these rules and the screen that reports them read the same
 * definitions - and so the rules can be tested without a database.
 *
 * The rule itself is short: a section somebody has rewritten belongs to them.
 * Regenerating is what the button is for, but a site manager who put a
 * paragraph into his own words, in a document that goes to a client with his
 * name on it, must not lose it because he pressed it again.
 */

/**
 * Splits a fresh draft into the sections it may write and the ones it must
 * leave alone.
 *
 * `edited` is the set carrying ai_generated = false - written or rewritten by
 * a person. Anything else in the report was written by the model and is the
 * model's to replace.
 */
export function partitionDraft<T extends string>(
  drafted: readonly T[],
  edited: readonly T[],
): { write: T[]; kept: T[] } {
  const off_limits = new Set<T>(edited);
  const write: T[] = [];
  const kept: T[] = [];

  for (const type of drafted) {
    if (off_limits.has(type)) kept.push(type);
    else write.push(type);
  }

  return { write, kept };
}

/**
 * One sentence saying what just happened.
 *
 * Skipping somebody's paragraph silently is as confusing as overwriting it
 * silently: they press the button, a section does not change, and nothing on
 * the screen says why.
 */
export function describeRegeneration({
  generated,
  kept,
}: {
  generated: number;
  kept: number;
}): string {
  const sections = (count: number) => `${count} ${count === 1 ? "section" : "sections"}`;

  if (kept === 0) return `${sections(generated)} rewritten from your notes.`;

  const yours = `${sections(kept)} you had edited ${kept === 1 ? "was" : "were"} left as you wrote ${
    kept === 1 ? "it" : "them"
  }.`;

  return generated === 0
    ? `Nothing was rewritten - ${yours} Clear a section to have it written again.`
    : `${sections(generated)} rewritten. ${yours}`;
}
