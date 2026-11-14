/**
 * "All works completed successfully" - next to work that is not.
 *
 * A real Completion Report said the works were complete in its Project Overview
 * and again, word for word, in Completed Works, while its own Outstanding
 * section recorded localised concrete patch repairs still to be carried out.
 * Both statements came from the evidence. Neither is a hallucination. Together
 * they are a document that tells a client the job is finished and, four
 * paragraphs later, that it is not.
 *
 * The rule this module encodes: **a blanket completion claim in a source is a
 * statement about that source's period, not about the project.** A Progress
 * Report that ends "all works completed successfully at the end of the week"
 * is describing that week. Carried into a Completion Report unqualified, it
 * becomes a claim about the whole job - and if anything anywhere in the same
 * document is still outstanding, it is a false one.
 *
 * Finding it is mechanical, so it is done mechanically and the reviewer is told
 * exactly where to look rather than asked to notice. Rewording is the model's
 * job; spotting is not.
 *
 * Pure, with no runtime imports and no path aliases, so a test loads it into
 * Node.
 */

export type ClaimSection = {
  /** The stored section type, e.g. `project_overview`. */
  type: string;
  /** What a reader sees above it. */
  label: string;
  content: string | null;
};

/**
 * Wording that claims the works, as a whole, are done.
 *
 * Deliberately narrow. "The manhole was rebuilt" is a completed activity and
 * belongs in Completed Works; "all works were completed" is a claim about the
 * project and is what this is looking for. A qualified claim - "the main hall
 * works were completed" - names its scope and is not caught.
 */
const BLANKET_COMPLETION = [
  /\ball\s+(?:the\s+)?works?\b[^.]{0,40}\bcomplet/i,
  /\bworks?\s+(?:were|was|had been|are|is)\s+completed\s+successfully/i,
  /\bcompleted\s+successfully\b/i,
  /\b(?:the\s+)?(?:project|package|scheme|job)\s+(?:is|was|has been)\s+(?:now\s+)?complet/i,
  /\bfully\s+complet/i,
  /\bworks?\s+(?:are|were)\s+(?:now\s+)?complete\b/i,
  /\bpractical\s+completion\s+(?:has been|was)\s+(?:achieved|reached)/i,
];

/**
 * Wording that records work still to do.
 *
 * Read from anywhere in the document, because the contradiction does not care
 * which section it is in - a follow-on item mentioned in a photographic record
 * caption contradicts a completion claim in the overview just as squarely.
 */
const OUTSTANDING = [
  /\bstill\s+to\s+be\b/i,
  /\bto\s+be\s+(?:carried\s+out|completed|undertaken|poured|installed|reinstated|made\s+good)\b/i,
  /\bremain(?:s|ing|ed)?\s+(?:to\s+be|outstanding|open)\b/i,
  /\boutstanding\b/i,
  /\bfollow[-\s]?on\b/i,
  /\bnot\s+(?:yet\s+)?(?:complete|completed|finished)\b/i,
  /\bawait(?:s|ing)\b/i,
  /\bprogrammed\s+for\b/i,
  /\bthe\s+following\s+day\b/i,
  /\bincomplete\b/i,
];

const text = (section: ClaimSection) => (section.content ?? "").trim();

/** Every section making a blanket claim that the works as a whole are complete. */
export function blanketCompletionClaims(
  sections: readonly ClaimSection[],
): { type: string; label: string; sentence: string }[] {
  const found: { type: string; label: string; sentence: string }[] = [];
  for (const section of sections) {
    const body = text(section);
    if (!body) continue;
    for (const sentence of body.split(/(?<=[.!?])\s+/)) {
      if (BLANKET_COMPLETION.some((pattern) => pattern.test(sentence))) {
        found.push({ type: section.type, label: section.label, sentence: sentence.trim() });
        break;
      }
    }
  }
  return found;
}

/** Every section recording work that is still to be done. */
export function outstandingMentions(
  sections: readonly ClaimSection[],
): { type: string; label: string; sentence: string }[] {
  const found: { type: string; label: string; sentence: string }[] = [];
  for (const section of sections) {
    const body = text(section);
    if (!body) continue;
    for (const sentence of body.split(/(?<=[.!?])\s+/)) {
      if (OUTSTANDING.some((pattern) => pattern.test(sentence))) {
        found.push({ type: section.type, label: section.label, sentence: sentence.trim() });
        break;
      }
    }
  }
  return found;
}

/**
 * The same sentence in two sections.
 *
 * Project Overview and Completed Works carried an identical sentence in the
 * report that started this. Compared on normalised words so a comma or a
 * capital does not hide it.
 */
export function repeatedSentences(
  sections: readonly ClaimSection[],
): { sentence: string; sections: string[] }[] {
  const seen = new Map<string, { sentence: string; sections: string[] }>();
  for (const section of sections) {
    const body = text(section);
    if (!body) continue;
    for (const raw of body.split(/(?<=[.!?])\s+/)) {
      const sentence = raw.trim();
      // Short sentences repeat innocently - a heading-like fragment, a date.
      if (sentence.split(/\s+/).length < 6) continue;
      const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const entry = seen.get(key);
      if (entry) {
        if (!entry.sections.includes(section.label)) entry.sections.push(section.label);
      } else {
        seen.set(key, { sentence, sections: [section.label] });
      }
    }
  }
  return Array.from(seen.values()).filter((entry) => entry.sections.length > 1);
}

export type CompletionContradiction = {
  kind: "completion_vs_outstanding" | "repeated_sentence";
  /** One line, written for the reviewer to act on. */
  line: string;
};

/**
 * What to tell the reviewer before it reads the document.
 *
 * Empty on a document with nothing wrong, which is the common case and costs
 * nothing. Where something is wrong it names the sections and quotes the
 * sentences, because "check for contradictions" is advice and "these two
 * sentences cannot both be true, here they are" is a task.
 */
export function completionContradictions(
  sections: readonly ClaimSection[],
): CompletionContradiction[] {
  const found: CompletionContradiction[] = [];

  const claims = blanketCompletionClaims(sections);
  const outstanding = outstandingMentions(sections);
  if (claims.length > 0 && outstanding.length > 0) {
    for (const claim of claims) {
      found.push({
        kind: "completion_vs_outstanding",
        line: `${claim.label} claims the works as a whole are complete - "${claim.sentence}" - while ${outstanding
          .map((item) => `${item.label} records "${item.sentence}"`)
          .join("; ")}. Both cannot be true of this document.`,
      });
    }
  }

  for (const repeat of repeatedSentences(sections)) {
    found.push({
      kind: "repeated_sentence",
      line: `${repeat.sections.join(" and ")} carry the same sentence - "${repeat.sentence}". It belongs in one of them.`,
    });
  }

  return found;
}

/** The heading those lines are given in the reviewer's evidence. */
export const CONTRADICTION_HEADING =
  "CONTRADICTIONS ALREADY FOUND IN THIS DOCUMENT (each one needs a warning, and the unsupported claim cut or qualified)";

/**
 * The line a client reads before anything else.
 *
 * Derived from the document, never asserted: it says the works are complete
 * only where nothing in the report is still open. Where anything is - an
 * outstanding sentence anywhere in the prose, or an issue that is not closed -
 * it says so plainly, in the words a site manager would use.
 *
 * Returns null where the report supports neither statement. A completion status
 * nobody can substantiate is worse than none: the reader then takes the
 * document's own words for it, which is the correct outcome.
 */
export function completionStatusLine(
  sections: readonly ClaimSection[],
  openIssueCount = 0,
): string | null {
  const written = sections.some((section) => text(section).length > 0);
  if (!written) return null;

  const outstanding = outstandingMentions(sections).length > 0 || openIssueCount > 0;
  if (outstanding) return "Primary works completed - follow-on works outstanding";

  // Only where the document itself says the works are done. A report that
  // simply never mentions completion is not a completed job.
  return blanketCompletionClaims(sections).length > 0 ? "Works completed" : null;
}

/** What the control panel calls that line. */
export const COMPLETION_STATUS_LABEL = "Status";
