/**
 * The Cleanup AI: what it is told, and what is done with what it returns.
 *
 * Kept apart from the OpenAI client that sends it, for the reasons given in
 * lib/ai/prompt.ts - no runtime imports and no path aliases, so this module
 * loads straight into Node and a test can assert what the model is actually
 * told without a key, a network or a database. The call itself lives in
 * lib/ai/cleanup.ts behind "server-only".
 *
 * ## Where this sits
 *
 *   raw / voice notes
 *     -> CLEANUP AI                    (here)
 *     -> section drafting              (lib/ai/prompt.ts, lib/ai/summary-prompt.ts)
 *     -> the assembled report
 *     -> MASTER AI REVIEW, later       (lib/ai/master-review-prompt.ts)
 *
 * The cleanup pass is new and additive, and it is the FIRST thing in that
 * chain, not the last. The Master AI Review is untouched by it: that layer
 * still reads the assembled document afterwards, still proposes changes a
 * person ticks before anything is saved, and is neither replaced nor merged
 * into this. Cleanup's only job is language - turning dictation into report
 * English, under a fixed glossary, without moving a fact or a status.
 *
 * Three consequences worth stating plainly, because all three are load-bearing:
 *
 * 1. Cleanup output is never written to a report section. It is an input to the
 *    drafting pass, which is what writes. Nothing here can reach a paragraph a
 *    person wrote: those carry ai_generated = false and are protected by
 *    partitionDraft at write time, and cleanup never gets that far.
 * 2. The drafting pass still receives the raw source verbatim and last, so the
 *    cleaned draft can always be checked against what was actually said.
 * 3. If the cleanup call fails, the pipeline carries on with the raw source
 *    exactly as it did before this layer existed. A degraded report is better
 *    than no report, and drafting has always been able to read raw notes.
 */

/**
 * The four documents with a cleanup path.
 *
 * All four are documents the app builds. `progress`, `completion` and `survey`
 * are the three `summary_reports` kinds and reach this through the same action;
 * `daily` is the Daily Report.
 *
 * A survey is a visit made before anybody has worked here, so its sections ask
 * what was found and what is proposed - never what was completed. That
 * distinction is the whole reason it has its own section list rather than
 * borrowing the progress one.
 */
export type CleanupDocumentKind = "daily" | "progress" | "completion" | "survey";

export type CleanupSectionDefinition = {
  type: string;
  label: string;
  /** Becomes the JSON-schema description for that field, so it is an instruction. */
  brief: string;
};

/**
 * Section briefs follow the house rule from lib/report-sections.ts: a brief
 * must never ask a question the source might not answer, because a field that
 * must be filled will be filled. Each one says what belongs in the section and
 * what its status means, and nothing else.
 *
 * The daily, progress and completion lists mirror the section types the app
 * already stores - e2e/cleanup-smoke.mjs fails if they drift apart, because a
 * cleaned section that does not match a real section type is dead text.
 */
export const CLEANUP_SECTIONS: Record<CleanupDocumentKind, readonly CleanupSectionDefinition[]> = {
  daily: [
    {
      type: "executive_summary",
      label: "Summary",
      brief:
        "Two or three sentences covering the work the source actually describes. Do not judge progress against programme.",
    },
    {
      type: "works_completed",
      label: "Works completed",
      brief:
        "Only work the source records as finished. Past tense. Work that is part-done belongs in works in progress, and work not yet started belongs in planned works.",
    },
    {
      type: "works_in_progress",
      label: "Works in progress",
      brief:
        "Only work the source records as started and continuing. Do not write it as finished.",
    },
    {
      type: "deliveries_plant",
      label: "Deliveries and plant",
      brief:
        "Deliveries and plant recorded in the source or the structured data, with quantities exactly as recorded.",
    },
    {
      type: "health_safety",
      label: "Health and safety",
      brief:
        "Briefings, inspections, incidents or near misses the source records. Leave empty if the source does not mention safety - silence is not the same as 'nothing was reported', which is itself a claim.",
    },
    {
      type: "issues_constraints",
      label: "Issues and constraints",
      brief:
        "What the source records as blocking or slowing the works - access, weather, information, other trades - kept at the certainty the source gives it.",
    },
    {
      type: "outstanding_items",
      label: "Outstanding items",
      brief:
        "Items the source records as awaiting a decision, an instruction, information or another party. Awaiting, not resolved.",
    },
    {
      type: "planned_works",
      label: "Planned works",
      brief:
        "Work the source records as intended or planned, and not yet started. Future tense throughout; never write planned work as done.",
    },
  ],
  progress: [
    {
      type: "period_summary",
      label: "Period summary",
      brief:
        "AT MOST THREE concise sentences overviewing the work evidenced in this period. Three sentences is a limit on length and never a licence to leave a fact out: tighten the wording until the material facts fit, and if one still will not fit, keep the fact.",
    },
    {
      type: "key_activities",
      label: "Key activities",
      brief: "The principal activities the evidence records across the period, without repeating one twice.",
    },
    {
      type: "works_completed",
      label: "Works completed",
      brief: "Only work the evidence explicitly records as completed during the period.",
    },
    {
      type: "works_in_progress",
      label: "Works in progress",
      brief: "Only work the evidence records as ongoing at the end of the period.",
    },
    {
      type: "resources_and_plant",
      label: "Resources and plant",
      brief: "Workforce and plant the evidence records, with numbers exactly as recorded.",
    },
    {
      type: "issues_and_resolutions",
      label: "Issues and resolutions",
      brief:
        "Issues the evidence records, their recorded status, and a resolution only where one is recorded.",
    },
    {
      type: "next_period",
      label: "Next period",
      brief: "Only work the evidence records as planned beyond this period. Future tense.",
    },
  ],
  completion: [
    {
      type: "project_overview",
      label: "Project overview",
      brief: "A factual overview of the project and the work the records evidence.",
    },
    {
      type: "scope_of_works",
      label: "Scope of works",
      brief: "The scope the records actually evidence. Do not infer contractual scope.",
    },
    {
      type: "stages_of_works",
      label: "Stages of works",
      brief: "The evidenced sequence of major stages, in the order the records give them.",
    },
    {
      type: "key_technical_activities",
      label: "Key technical activities",
      brief: "Technical activities explicitly recorded, with materials, methods and references as recorded.",
    },
    {
      type: "completed_works",
      label: "Completed works",
      brief:
        "Work the records explicitly record as complete. Completion is not approval, acceptance, compliance or certification.",
    },
    {
      type: "issues_and_resolutions",
      label: "Issues and resolutions",
      brief: "Issues raised, their recorded outcome, and a resolution only where one is recorded.",
    },
    {
      type: "photographic_record",
      label: "Photographic record",
      brief:
        "A short introduction to the images the metadata lists. Do not state what an image proves.",
    },
    {
      type: "sign_off",
      label: "Sign-off",
      brief:
        "Only sign-off, handover or acceptance facts explicitly present in the records. Leave empty if none is.",
    },
  ],
  survey: [
    {
      type: "survey_purpose",
      label: "Purpose of visit",
      brief:
        "Why the visit was made and what was being investigated. Never a statement about work carried out - a survey records a visit, not a job.",
    },
    {
      type: "existing_condition",
      label: "Findings and existing condition",
      brief:
        "What was actually found on site, as observed, with location and extent as recorded. Observed is not confirmed, verified, tested or assessed.",
    },
    {
      type: "measurements",
      label: "Measurements",
      brief:
        "Dimensions, quantities and areas taken on site, exactly as recorded, with what each one refers to. Never round one, and never present an estimate as a measurement.",
    },
    {
      type: "access_and_constraints",
      label: "Access and site constraints",
      brief:
        "How the area is reached and what limits working there, as established on the visit: routes, restrictions, trading hours, height, storage, permits recorded as needed.",
    },
    {
      type: "proposed_works",
      label: "Recommended works",
      brief:
        "What is proposed to put the findings right, in the conditional. Proposed is not instructed, agreed, approved or done, and must never be written as any of them.",
    },
    {
      type: "requirements",
      label: "Materials, plant and access requirements",
      brief:
        "What carrying out the recommended works would require. A requirement in the future, never a record of anything supplied, delivered or used.",
    },
    {
      type: "pricing_notes",
      label: "Notes for pricing",
      brief:
        "Unknowns, risks, assumptions and anything recorded as still needing confirmation. Keep every hedge the source puts on them.",
    },
  ],
};

export function cleanupSectionsFor(kind: CleanupDocumentKind): readonly CleanupSectionDefinition[] {
  return CLEANUP_SECTIONS[kind];
}

/**
 * The owner's rule for the progress-report period summary: three sentences.
 *
 * It is asked for in the system prompt and in the section brief, and it is NOT
 * enforced by cutting anything afterwards. There used to be a cap here that
 * dropped the fourth sentence and everything after it, on the reasoning that
 * the summary only restates what the detail sections carry. That reasoning is
 * wrong often enough to be dangerous: the fourth sentence can be the only place
 * a fact appears, and silently deleting a fact from a contractual record is a
 * worse fault than a summary one sentence too long.
 *
 * Fact preservation outranks brevity. Where the model returns more than three
 * sentences the full text is kept, and lib/ai/cleanup.ts notes it in the log so
 * a prompt that keeps overrunning can be found and fixed at the prompt.
 */
export const PERIOD_SUMMARY_MAX_SENTENCES = 3;

/** The sections the three-sentence rule is asked of, by type. */
export const LENGTH_GUIDED_SECTIONS: Readonly<Record<string, number>> = {
  period_summary: PERIOD_SUMMARY_MAX_SENTENCES,
};

/**
 * How the raw material is introduced to the cleanup pass.
 *
 * Worded from the same lesson as RAW_NOTES_LABEL in lib/ai/prompt.ts: calling
 * this the site manager's own words, or asking for its grammar to be fixed, is
 * a commission to proofread, and a proofreader hands the notes back with the
 * commas moved. This is raw material.
 */
export const CLEANUP_SOURCE_LABEL =
  "SOURCE MATERIAL (dictated or typed on site, rough and unpunctuated - raw material to be rewritten, not text to be corrected):";

/**
 * Media are described by their metadata, never by what they look like: the
 * cleanup pass cannot see them.
 */
export const CLEANUP_MEDIA_LABEL =
  "MEDIA METADATA (the only basis for calling an item a photograph or a drawing - an item recorded as unknown is neither):";

/** How the Master AI Review is shown this pass's output. See lib/ai/prompt.ts. */
export const CLEANUP_OUTPUT_KIND_LABELS: Readonly<Record<CleanupDocumentKind, string>> = {
  daily: "DAILY REPORT",
  progress: "PROGRESS REPORT",
  completion: "COMPLETION REPORT",
  survey: "SURVEY REPORT",
};

export type CleanupMedia = {
  /**
   * From stored metadata only, never from a caption or a filename.
   *
   * A photograph is a row in `photos`. A drawing is a document whose recorded
   * doc_type is `drawing`. Any other supporting document is `document` and is
   * named by its own type. "unknown" is for anything whose metadata does not
   * say, and the model is told not to characterise those at all.
   */
  kind: "photograph" | "drawing" | "document" | "unknown";
  /** What the metadata calls it - "Drawing", "RAMS", a photo's status tag. */
  typeLabel: string | null;
  /** A drawing number and revision, or a photo reference, exactly as recorded. */
  reference: string | null;
  caption: string | null;
};

export type CleanupInput = {
  kind: CleanupDocumentKind;
  projectName: string;
  client: string | null;
  siteAddress: string | null;
  /** A date, or a period, already formatted by the caller. */
  dateLine: string | null;
  weather: string | null;
  authorName: string | null;
  /** Structured facts recorded alongside the source: workforce, plant, issues. */
  context: readonly { label: string; text: string }[];
  media: readonly CleanupMedia[];
  /** The raw notes, or the assembled evidence, verbatim. */
  source: string;
};

/**
 * Built once at module load from the glossary, so the terminology the model is
 * shown and the terminology the tests assert are the same list.
 */
function sectionsBlock(kind: CleanupDocumentKind): string {
  return cleanupSectionsFor(kind)
    .map((section) => `- ${section.label} (${section.type}): ${section.brief}`)
    .join("\n");
}

export const CLEANUP_SYSTEM_PROMPT_HEAD = [
  "You are the cleanup pass in a UK construction reporting system.",
  "",
  "You are given raw site material - dictated into a phone, typed one-handed,",
  "abbreviated, unpunctuated - together with the structured facts recorded",
  "alongside it. You rewrite that material into concise, professional British",
  "construction-report language, section by section.",
  "",
  "You are the FIRST of two passes. A separate review pass reads your output",
  "afterwards, against this same source. You are not that review. Do not",
  "comment, flag, caveat, explain, apologise, or address the reviewer. Return",
  "only the rewritten section text.",
  "",
  "WHAT YOU CHANGE",
  "",
  "- Register. \"sign was put up\" becomes \"installation works were completed to",
  "  the signage\". \"we made good the wall\" becomes \"making-good works were",
  "  undertaken\".",
  "- Terminology. Use the glossary below, consistently, every time.",
  "- Structure. Consolidate scattered or repeated notes about the same work into",
  "  one statement. One item of work, one description.",
  "- Voice. Impersonal - \"works were completed\", never \"I did\" or \"we did\".",
  "- Length. Concise. A cleaned section is shorter than the rambling notes it",
  "  came from, never longer.",
  "",
  "WHAT YOU MUST NOT CHANGE",
  "",
  "The facts, and the degree of certainty attached to them.",
  "",
  "Carry these through exactly as recorded. Never round, convert, re-order,",
  "renumber, complete or infer them:",
  "",
  "- quantities, dimensions, areas, volumes, durations and times",
  "- dates, and the order in which a date is written",
  "- locations: levels, rooms, plots, grid references, elevations, chainages",
  "- materials, products and specifications",
  "- plant and equipment, and how many of each",
  "- every reference number - drawing, RAMS, permit, issue, report, order",
  "",
  "Never invent. Every statement must be traceable to the source material or the",
  "structured facts. If the source does not say it, it does not appear.",
  "",
  "Where the source is unclear or could be read two ways, write the conservative",
  "version both readings support, or leave the detail out. Never resolve an",
  "ambiguity by choosing the likely meaning.",
].join("\n");

export const CLEANUP_SYSTEM_PROMPT_TAIL = [
  "SECTIONS AND STATUS",
  "",
  "Put each piece of information under the section whose status it actually has,",
  "and state it once. Status is the thing most easily lost in a rewrite, so it",
  "is the thing to get right:",
  "",
  "- Works completed: finished. Past tense.",
  "- Works in progress: started, not finished, continuing. Present continuous.",
  "- Issues: recorded as blocking, slowing or going wrong, at the certainty the",
  "  source gives it.",
  "- Outstanding: awaiting a decision, an instruction, information or another",
  "  party. Awaiting, not resolved.",
  "- Planned works: intended, not yet started. Future tense.",
  "",
  "Work described in the future NEVER appears as work completed. \"Screed starts",
  "Monday\" is planned works and stays in the future, in every section it touches.",
  "",
  "A section the source does not support comes back as an empty string. An empty",
  "section is a correct answer and is expected. Padding one is a serious error.",
  "",
  "Silence is not evidence of absence. Where the source says nothing about",
  "something, the section is empty. Never write that there were no delays, no",
  "issues, no incidents, no defects, nothing outstanding, that nothing was",
  "reported, or that the works are on programme. A nil return is a claim like",
  "any other, and a silent source does not support it.",
  "",
  "LENGTH LIMITS NEVER COST A FACT",
  "",
  "Where a section asks for a maximum number of sentences - the period summary",
  "asks for three - that is a limit on length, never permission to leave",
  "something out. Tighten the wording until the material facts fit: combine",
  "clauses, cut filler, drop connective phrasing that carries no fact.",
  "",
  "If after tightening a material fact still will not fit, KEEP THE FACT and",
  "write the extra sentence. Nothing downstream trims you, and a summary one",
  "sentence too long is a far smaller fault than a record with a fact missing",
  "from it. Fact preservation outranks brevity everywhere in this document.",
  "",
  "PHOTOGRAPHS AND DRAWINGS",
  "",
  "You cannot see any image or open any document. The media metadata is the only",
  "thing that says what an item is. Call an item a photograph only where the",
  "metadata records a photograph, and a drawing only where the metadata records a",
  "drawing; call any other supporting document by the type the metadata gives it.",
  "Where the metadata is absent, unrecorded or says unknown, do not characterise",
  "it at all and do not mention it. Never infer the type from a caption, a title,",
  "a filename or the surrounding text.",
  "",
  "Reference numbers, revisions and drawing numbers are reproduced exactly as",
  "recorded, and never renumbered, completed or tidied up.",
  "",
  "A media item is evidence that the item exists and was recorded. It is not",
  "evidence that anything happened, that anything was inspected, or that the work",
  "matches what a drawing shows. A caption is not an event.",
  "",
  "FORMAT",
  "",
  "Continuous prose in full sentences, one or two short paragraphs per section.",
  "Bullet lines only for genuine lists - deliveries, plant, outstanding items.",
  "No headings, no markdown, no section labels inside the text, no preamble, no",
  "closing remark. Return only the rewritten section text.",
  "",
  "This report is a contractual record. It may be read months later in a dispute",
  "about delay or defect, next to the raw material it came from. Write only what",
  "that material will support.",
].join("\n");

/**
 * The whole system prompt, assembled with the glossary and status discipline
 * the caller supplies.
 *
 * Taking those as arguments rather than importing them keeps this module free
 * of runtime imports - the property that lets a test load it in Node. The one
 * caller that matters, buildCleanupPrompt's sibling in lib/ai/cleanup.ts,
 * always passes the real blocks from lib/ai/glossary.ts.
 */
export function cleanupSystemPrompt(
  kind: CleanupDocumentKind,
  blocks: { glossary: string; statusDiscipline: string },
): string {
  return [
    CLEANUP_SYSTEM_PROMPT_HEAD,
    "",
    blocks.statusDiscipline,
    "",
    blocks.glossary,
    "",
    CLEANUP_SYSTEM_PROMPT_TAIL,
    "",
    `SECTIONS OF THIS ${CLEANUP_OUTPUT_KIND_LABELS[kind]}`,
    "",
    sectionsBlock(kind),
  ].join("\n");
}

export function buildCleanupPrompt(input: CleanupInput): string {
  const media = input.media.length
    ? input.media
        .map((item) => {
          const type = item.typeLabel ? ` (${item.typeLabel})` : "";
          const reference = item.reference ? ` ${item.reference}` : "";
          const caption = item.caption ? ` "${item.caption}"` : " (nothing recorded against it)";
          return item.kind === "unknown"
            ? `- unknown item${reference}${caption} - metadata does not say what this is`
            : `- ${item.kind}${type}${reference}${caption}`;
        })
        .join("\n")
    : "- none recorded";

  return [
    `DOCUMENT: ${CLEANUP_OUTPUT_KIND_LABELS[input.kind]}`,
    `PROJECT: ${input.projectName}`,
    input.client ? `CLIENT: ${input.client}` : null,
    input.siteAddress ? `SITE: ${input.siteAddress}` : null,
    input.dateLine,
    input.weather ? `WEATHER: ${input.weather}` : null,
    input.authorName ? `RECORDED BY: ${input.authorName}` : null,
    ...input.context.flatMap((block) => ["", `${block.label}:`, block.text]),
    "",
    CLEANUP_MEDIA_LABEL,
    media,
    "",
    CLEANUP_SOURCE_LABEL,
    // Verbatim, and last. Nothing between this label and the material, and
    // nothing that alters it: the review pass afterwards reads the same text.
    input.source,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * The exact request body sent to the model.
 *
 * Exported rather than inlined in lib/ai/cleanup.ts so a test can post the real
 * body to the stub over real HTTP and feed the reply to parseCleanupResponse -
 * the same two functions the app uses, with nothing duplicated between them.
 */
export function cleanupRequest(
  input: CleanupInput,
  options: { model: string; glossary: string; statusDiscipline: string },
) {
  const definitions = cleanupSectionsFor(input.kind);

  return {
    model: options.model,
    messages: [
      {
        role: "system" as const,
        content: cleanupSystemPrompt(input.kind, {
          glossary: options.glossary,
          statusDiscipline: options.statusDiscipline,
        }),
      },
      { role: "user" as const, content: buildCleanupPrompt(input) },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: `${input.kind}_cleanup_sections`,
        strict: true,
        schema: {
          type: "object",
          properties: Object.fromEntries(
            definitions.map((section) => [
              section.type,
              {
                type: "string",
                description: `${section.brief} Return an empty string when the source does not support it.`,
              },
            ]),
          ),
          // Every key required, any of them "" - the same contract the drafting
          // pass uses to let the model say "the source does not cover this".
          required: definitions.map((section) => section.type),
          additionalProperties: false,
        },
      },
    },
  };
}

/**
 * Abbreviations that end in a full stop without ending a sentence.
 *
 * "2no." and "approx." are the ones that actually appear in site notes, and
 * splitting a sentence at either of them would cut a quantity in half.
 */
const ABBREVIATION_END =
  /(?:\d(?:no|nos)|\b(?:no|nos|approx|ref|dwg|dia|max|min|est|incl|etc|ltd|co|hr|hrs|e\.g|i\.e|vs)|\s[A-Z])\.["')\]]?$/i;

/**
 * Splits prose into sentences conservatively.
 *
 * Used to notice that a summary ran long, never to cut one: nothing in this
 * module removes a sentence. Conservative means that when in doubt it does not
 * split, so a miscount errs towards saying nothing is wrong.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences: string[] = [];
  const boundary = /[.!?]["')\]]?(?=\s|$)/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(trimmed)) !== null) {
    const end = match.index + match[0].length;
    const candidate = trimmed.slice(start, end);
    if (ABBREVIATION_END.test(candidate)) continue;

    // A stop followed by lower case is decimal notation or shorthand, not the
    // end of a sentence.
    const rest = trimmed.slice(end).trimStart();
    if (rest && !/^["'([]?[A-Z0-9]/.test(rest)) continue;

    sentences.push(candidate.trim());
    start = end;
  }

  const tail = trimmed.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/**
 * The sections that came back longer than their brief asked for.
 *
 * Reports, and changes nothing. It exists so an overrun is visible in the log
 * rather than fixed by deleting somebody's facts - the fix for a summary that
 * runs long is a better prompt, not a shorter record.
 */
export function overLongSections(sections: CleanupSections): {
  type: string;
  sentences: number;
  asked: number;
}[] {
  return Object.entries(sections).flatMap(([type, text]) => {
    const asked = LENGTH_GUIDED_SECTIONS[type];
    if (asked === undefined) return [];
    const sentences = splitSentences(text).length;
    return sentences > asked ? [{ type, sentences, asked }] : [];
  });
}

/**
 * Strips the packaging a model adds around section text.
 *
 * "Return only the rewritten section text" is an instruction, and instructions
 * are followed most of the time. A leading "Works completed:" or a markdown
 * heading would otherwise be stored as report text and printed in the PDF.
 * Nothing here removes a sentence - only labels, fences and heading markers.
 */
export function cleanSectionText(text: string, label: string): string {
  let value = text.trim();

  // A fenced block around the whole answer.
  const fenced = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(value);
  if (fenced) value = fenced[1].trim();

  // A markdown heading marker, with or without the section's own name after it.
  value = value.replace(/^#{1,6}\s+/, "");

  // The section's own label repeated as a lead-in.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  value = value.replace(new RegExp(`^${escaped}\\s*[:\\-–]\\s*`, "i"), "");

  // Bold or italic wrapping the entire answer.
  const emphasised = /^\*\*([\s\S]+)\*\*$/.exec(value.trim());
  if (emphasised) value = emphasised[1].trim();

  return value.replace(/\n{3,}/g, "\n\n").trim();
}

export type CleanupSections = Record<string, string>;

export type CleanupParseResult =
  | { ok: true; sections: CleanupSections }
  | { ok: false; error: string };

/**
 * Turns the model's JSON into the sections the review pass is shown.
 *
 * Empty sections are dropped rather than carried as empty strings: the review
 * pass should see the sections cleanup could write, and a heading with nothing
 * under it is an invitation to fill it.
 */
export function parseCleanupResponse(
  kind: CleanupDocumentKind,
  content: string,
): CleanupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "The cleanup pass did not return JSON." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "The cleanup pass did not return an object." };
  }

  const record = parsed as Record<string, unknown>;
  const sections: CleanupSections = {};

  for (const definition of cleanupSectionsFor(kind)) {
    const raw = record[definition.type];
    if (raw === undefined) {
      return { ok: false, error: `The cleanup pass omitted ${definition.type}.` };
    }
    if (typeof raw !== "string") {
      return { ok: false, error: `The cleanup pass returned a non-string ${definition.type}.` };
    }

    // Packaging is stripped; text never is. A section that came back longer
    // than its brief asked for is returned in full - see
    // PERIOD_SUMMARY_MAX_SENTENCES.
    const value = cleanSectionText(raw, definition.label);
    if (value) sections[definition.type] = value;
  }

  return { ok: true, sections };
}

/**
 * The cleaned sections as the Master AI Review is handed them: labelled text,
 * in section order, ready for the block lib/ai/prompt.ts builds.
 */
export function formatCleanedSections(
  kind: CleanupDocumentKind,
  sections: CleanupSections,
): { label: string; text: string }[] {
  return cleanupSectionsFor(kind)
    .filter((section) => sections[section.type]?.trim())
    .map((section) => ({ label: section.label, text: sections[section.type].trim() }));
}
