/**
 * A fact told once.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * A Completion Report's summary is the overall position; its follow-on is
 * only what is genuinely outstanding or still to be done. The model is told
 * that, and on the real build still wrote "The warehouse doors were not
 * worked on in the recorded period." in both. A prompt is a request; this is
 * the rule. Any sentence the summary already carries is dropped from the
 * follow-on, compared with case, spacing and closing punctuation set aside so
 * the same fact in the same words cannot slip through on a full stop.
 *
 * Only whole sentences, and only exact ones. A follow-on sentence that says
 * more than the summary did is a different sentence and stays.
 */

const normalise = (sentence: string): string =>
  sentence
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[.!?;:,]+$/g, "")
    .trim();

/** Sentences, keeping bullet lines whole: a "- " line is one item, not prose. */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[-•]\s/.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    for (const part of trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
      if (part.trim()) out.push(part.trim());
    }
  }
  return out;
}

/**
 * `secondary` with every sentence already present in `primary` removed.
 *
 * Paragraph breaks are kept where something survives on both sides of them;
 * a paragraph emptied entirely disappears with its break. Returns the text
 * unchanged when nothing repeats, so a report with no duplication is stored
 * byte for byte as the model wrote it.
 */
export function withoutSentencesIn(secondary: string, primary: string): string {
  if (!secondary.trim() || !primary.trim()) return secondary;
  const said = new Set(sentencesOf(primary).map(normalise));
  if (said.size === 0) return secondary;

  const paragraphs = secondary.split(/\n{2,}/).map((paragraph) =>
    paragraph
      .split(/\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (/^[-•]\s/.test(trimmed)) return said.has(normalise(trimmed)) ? "" : line;
        const kept = sentencesOf(trimmed).filter((sentence) => !said.has(normalise(sentence)));
        return kept.join(" ");
      })
      .filter((line) => line.trim())
      .join("\n"),
  );

  const result = paragraphs.filter((paragraph) => paragraph.trim()).join("\n\n");
  return result === secondary ? secondary : result;
}
