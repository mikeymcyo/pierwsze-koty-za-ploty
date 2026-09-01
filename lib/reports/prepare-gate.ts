/**
 * Whether there is enough to write a Daily from, and if not, what to ask.
 *
 * Prepare Daily is the one AI action a site operative presses, and the thing
 * it must never do is turn nothing into a confident paragraph. But a screen
 * full of questions is the other failure: a worker who spoke for a minute and
 * took six photographs has done their job, and being quizzed about plant they
 * never used teaches them not to press the button.
 *
 * So this asks only where the answer decides whether the report is true, and
 * it asks at most two things. Workforce and plant are never asked for - they
 * are a record that carries over, not evidence of the day, and the writer
 * already knows how to say "none recorded".
 *
 * Pure, with no runtime imports and no path aliases, so the rules load into
 * Node and are tested without a database or a model.
 */

export type PrepareQuestion = {
  id: "nothing_said" | "scope_not_mentioned";
  text: string;
  /** Where the answer goes: the microphone on this screen. */
  answerBy: "speak";
};

export type PrepareEvidence = {
  /** Today's captures, as spoken or typed, in order. */
  notes: string[];
  photoCount: number;
  /**
   * The work the job's paperwork instructs, one item each, from readings that
   * passed the quote check. Empty where nothing has been read.
   */
  instructedScope: string[];
};

export const MAX_QUESTIONS = 2;

/** Words too common to say anything about which job item a note is about. */
const STOP_WORDS = new Set([
  "the", "and", "that", "with", "this", "from", "have", "were", "been", "they",
  "there", "their", "which", "will", "into", "onto", "also", "than", "then",
  "them", "some", "what", "when", "where", "site", "work", "works", "today",
  "done", "all", "for", "not", "was", "are", "out", "our", "one", "two",
  "new", "old", "off", "over", "under", "both", "each", "still", "just",
  "including", "replacement", "carried", "required", "further", "written",
]);

/** The words in a piece of text that could identify what it is about. */
export function significantWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    const word = raw.replace(/s$/, "");
    if (word.length >= 4 && !STOP_WORDS.has(word) && !STOP_WORDS.has(raw)) words.add(word);
  }
  return words;
}

/**
 * Whether any instructed item is recognisably mentioned in the notes.
 *
 * A crude test on purpose. "Sorted the doors" against "Rectify the warehouse
 * doors so that both leaves close" shares "door" and is a mention. Nothing
 * here decides whether the work was done - only whether the day's notes touch
 * the job at all, which is the one thing worth one question.
 */
export function scopeMentioned(notes: string[], instructedScope: string[]): boolean {
  if (instructedScope.length === 0) return true;
  const said = significantWords(notes.join("\n"));
  if (said.size === 0) return false;
  return instructedScope.some((item) => {
    for (const word of significantWords(item)) {
      if (said.has(word)) return true;
    }
    return false;
  });
}

/**
 * The questions worth asking before drafting, in the order they matter.
 *
 * Empty means draft now. At most MAX_QUESTIONS, and the first is always the
 * one without which there is no report at all.
 */
export function prepareQuestions(evidence: PrepareEvidence): PrepareQuestion[] {
  const questions: PrepareQuestion[] = [];
  const saidSomething = evidence.notes.some((note) => note.trim().length > 0);

  if (!saidSomething) {
    questions.push({
      id: "nothing_said",
      answerBy: "speak",
      text:
        evidence.photoCount > 0
          ? "Photos are in, but nothing has been said. Say a sentence or two about what was done today."
          : "Nothing has been said about today yet. Say what was done.",
    });
    // With nothing said, the scope question would be the same question twice.
    return questions;
  }

  if (!scopeMentioned(evidence.notes, evidence.instructedScope)) {
    const items = evidence.instructedScope.slice(0, 2);
    const named = items.length === 2 ? `${items[0]} and ${items[1]}` : items[0];
    questions.push({
      id: "scope_not_mentioned",
      answerBy: "speak",
      text: `The paperwork asks for ${named}. Was any of that worked on today? If not, say so and the report will say so.`,
    });
  }

  return questions.slice(0, MAX_QUESTIONS);
}

/** A one-line version of an instructed item, for a question on a phone. */
export function shortScope(item: string, limit = 60): string {
  const flat = item.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}
