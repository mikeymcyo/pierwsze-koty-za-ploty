/**
 * Guards on the Cleanup AI: the pass that turns raw and dictated site material
 * into professional section text before anything else in the chain runs.
 *
 *   raw / voice notes -> CLEANUP AI -> section drafting -> the assembled report
 *   -> MASTER AI REVIEW, later and untouched by any of this.
 *
 * Two things are checked here, and the second is the reason this file is worth
 * having.
 *
 * The contract around the prompt - what the model is actually told about
 * status, terminology, references, media and silence. Prose quality cannot be
 * asserted without a real model and a human reading the result; the rules it is
 * given can.
 *
 * And the code that runs on our side of the reply. "At most three sentences" is
 * an instruction to a model, which is to say a request; the cap that makes it
 * true is here, and so is the stripping that keeps a markdown heading out of a
 * report. Those are tested against a real HTTP round-trip to the local stub,
 * using the same request builder and the same parser the app calls, for all
 * four document kinds.
 *
 * Needs no OpenAI key, no Supabase and no dev server:
 *
 *   npm run test:cleanup
 */

import { readFileSync } from "node:fs";

import {
  BRITISH_CONVENTIONS,
  GLOSSARY,
  NOT_UNLESS_SOURCED,
  STATUS_ESCALATIONS,
  glossaryBlock,
  statusDisciplineBlock,
} from "../lib/ai/glossary.ts";
import {
  CAPPED_SECTIONS,
  CLEANUP_MEDIA_LABEL,
  CLEANUP_SECTIONS,
  CLEANUP_SOURCE_LABEL,
  PERIOD_SUMMARY_MAX_SENTENCES,
  buildCleanupPrompt,
  capSentences,
  cleanSectionText,
  cleanupRequest,
  cleanupSectionsFor,
  cleanupSystemPrompt,
  formatCleanedSections,
  parseCleanupResponse,
  splitSentences,
} from "../lib/ai/cleanup-prompt.ts";
import { CLEANED_SECTIONS_LABEL, RAW_NOTES_LABEL, SYSTEM_PROMPT, buildPrompt } from "../lib/ai/prompt.ts";
import { REPORT_SECTIONS } from "../lib/report-sections.ts";
import {
  COMPLETION_SECTIONS,
  PROGRESS_SECTIONS,
  SURVEY_SECTIONS,
} from "../lib/summary-reports/sections.ts";
import { MASTER_REVIEW_SYSTEM_PROMPT } from "../lib/ai/master-review-prompt.ts";
import { CLEANUP_MARKER, STUB_PORT, startStub } from "./stub-openai.mjs";

const failures = [];
function check(label, ok, detail = "") {
  if (!ok) failures.push(detail ? `${label} - ${detail}` : label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${!ok && detail ? ` - ${detail}` : ""}`);
}

const KINDS = ["daily", "progress", "completion", "survey"];

const BLOCKS = { glossary: glossaryBlock(), statusDiscipline: statusDisciplineBlock() };

/** Flattened, because the prompt is hard-wrapped and a phrase can straddle a break. */
const flatFor = (kind) => cleanupSystemPrompt(kind, BLOCKS).replace(/\s+/g, " ").toLowerCase();

// Deliberately awkward: dictated punctuation, a line break, a trailing space, a
// non-ASCII character, a quantity that ends in a full stop, and a reference.
const SOURCE = `sign put up on drawing A-101 rev C with 4no. extra rods and chemical anchor plus, washers
were added, area on side of building re-plastered and repainted – 2no. coats, screed starts monday `;

const inputFor = (kind) => ({
  kind,
  projectName: "Lidl South Croydon - External Works",
  client: "Lidl GB",
  siteAddress: "South Croydon",
  dateLine: "DATE: 2026-08-30",
  weather: "Dry, 18C",
  authorName: "Maciej",
  context: [{ label: "WORKFORCE ON SITE", text: "- Empire Interiors (Plastering): 3 operative(s)" }],
  media: [
    { kind: "photograph", typeLabel: null, reference: null, caption: "Safety" },
    { kind: "drawing", typeLabel: "Drawing", reference: "A-101 rev C", caption: "Roof plan" },
    { kind: "document", typeLabel: "RAMS", reference: "RA-14", caption: "Working at height" },
    { kind: "unknown", typeLabel: null, reference: null, caption: "something on the phone" },
  ],
  source: SOURCE,
});

console.log("\n1. The cleanup layer sits first, and replaces nothing that follows it");

const reviewPrompt = buildPrompt({
  projectName: "P",
  client: null,
  siteAddress: null,
  reportDate: "2026-08-30",
  weather: null,
  authorName: null,
  workforce: [],
  plant: [],
  photos: [],
  rawNotes: SOURCE,
  cleanedSections: [{ label: "Works completed", text: "Cleaned wording." }],
});

check(
  "the drafting pass still receives the raw notes verbatim",
  reviewPrompt.includes(SOURCE),
);
check(
  "and they are still the last thing it reads, under their own label",
  reviewPrompt.endsWith(`${RAW_NOTES_LABEL}\n${SOURCE}`),
  JSON.stringify(reviewPrompt.slice(-60)),
);
check(
  "the cleaned draft is handed over before them, under its own label",
  reviewPrompt.indexOf(CLEANED_SECTIONS_LABEL) > -1 &&
    reviewPrompt.indexOf(CLEANED_SECTIONS_LABEL) < reviewPrompt.indexOf(RAW_NOTES_LABEL),
);
check(
  "the label says the draft is not evidence and not a source of fact",
  /not evidence/i.test(CLEANED_SECTIONS_LABEL) && /not a source of fact/i.test(CLEANED_SECTIONS_LABEL),
  CLEANED_SECTIONS_LABEL,
);

const reviewFlat = SYSTEM_PROMPT.replace(/\s+/g, " ").toLowerCase();
check(
  "drafting is told to read the draft against the notes",
  reviewFlat.includes("read the draft against the notes"),
);
check(
  "and to write the weaker version where the draft firmed a status up",
  reviewFlat.includes("write the weaker version the notes support"),
);
check(
  "and never to treat the draft as evidence",
  reviewFlat.includes("never treat the draft itself as evidence"),
);

// The Master AI Review is a separate layer that reads the assembled document
// afterwards. Merging the two was explicitly ruled out, and the cheapest proof
// that it did not happen is that the reviewer has never heard of a cleanup
// pass: it reviews sections and evidence, not a draft of a draft.
const masterFlat = MASTER_REVIEW_SYSTEM_PROMPT.replace(/\s+/g, " ").toLowerCase();
check(
  "the Master AI Review prompt is untouched by the cleanup layer",
  !masterFlat.includes("cleanup") && !masterFlat.includes("cleaned draft"),
);
check(
  "and still does the job it did before - sub-editor, not author",
  masterFlat.includes("you are a sub-editor") && masterFlat.includes("flag, never resolve"),
);

// Without a cleaned draft the prompt is what it was before this layer existed,
// which is what a failed cleanup falls back to.
const withoutCleanup = buildPrompt({
  projectName: "P",
  client: null,
  siteAddress: null,
  reportDate: "2026-08-30",
  weather: null,
  authorName: null,
  workforce: [],
  plant: [],
  photos: [],
  rawNotes: SOURCE,
});
check(
  "with no cleaned draft the drafting prompt carries no cleanup block at all",
  !withoutCleanup.includes(CLEANED_SECTIONS_LABEL),
);
check(
  "so a cleanup that cannot run leaves the pipeline as it was",
  withoutCleanup.endsWith(`${RAW_NOTES_LABEL}\n${SOURCE}`),
);

console.log("\n2. Every document kind has a cleanup path, and its sections are the real ones");

for (const kind of KINDS) {
  check(`${kind} has cleanup sections`, cleanupSectionsFor(kind).length > 0);
}

const typesOf = (definitions) => definitions.map((section) => section.type).join(",");
check(
  "daily cleans exactly the sections a daily report stores",
  typesOf(CLEANUP_SECTIONS.daily) === typesOf(REPORT_SECTIONS),
  typesOf(CLEANUP_SECTIONS.daily),
);
check(
  "progress cleans exactly the sections a progress report stores",
  typesOf(CLEANUP_SECTIONS.progress) === typesOf(PROGRESS_SECTIONS),
  typesOf(CLEANUP_SECTIONS.progress),
);
check(
  "completion cleans exactly the sections a completion report stores",
  typesOf(CLEANUP_SECTIONS.completion) === typesOf(COMPLETION_SECTIONS),
  typesOf(CLEANUP_SECTIONS.completion),
);
check(
  "survey cleans exactly the sections a site survey stores",
  typesOf(CLEANUP_SECTIONS.survey) === typesOf(SURVEY_SECTIONS),
  typesOf(CLEANUP_SECTIONS.survey),
);
// A survey is a visit made before anybody has worked here. A section list that
// asks what was completed is how a survey comes to imply that work happened.
check(
  "and none of them asks what was completed",
  CLEANUP_SECTIONS.survey.every((section) => !/completed|works_completed/i.test(section.type)),
);

// The rule from lib/report-sections.ts: a brief that poses a question gets an
// answer, because a field that must be filled will be filled.
for (const kind of KINDS) {
  for (const section of cleanupSectionsFor(kind)) {
    check(
      `${kind}/${section.type} does not ask a question the source may not answer`,
      !/\bwhether\b/i.test(section.brief),
      section.brief,
    );
  }
}

console.log("\n3. The status rules: nothing is upgraded, and the future stays in the future");

for (const kind of KINDS) {
  const flat = flatFor(kind);
  for (const rule of STATUS_ESCALATIONS) {
    check(
      `${kind}: ${rule.from} -> ${rule.to} is named as forbidden`,
      flat.includes(`${rule.from} -> ${rule.to}`.toLowerCase()),
    );
  }
  check(
    `${kind}: future work never becomes completed work`,
    flat.includes("work described in the future never appears as work completed"),
  );
  check(`${kind}: planned works stays in the future tense`, flat.includes("future tense"));
  check(`${kind}: hedged wording stays hedged`, flat.includes("hedged wording in the source stays hedged"));
  check(
    `${kind}: works completed means finished`,
    flat.includes("works completed: finished"),
  );
  check(
    `${kind}: outstanding means awaiting, not resolved`,
    flat.includes("awaiting, not resolved"),
  );
}

for (const term of NOT_UNLESS_SOURCED) {
  check(
    `"${term}" may be used only where the source uses it`,
    statusDisciplineBlock().toLowerCase().includes(term.toLowerCase()),
  );
}
check(
  "and the rule for that list is stated",
  statusDisciplineBlock().replace(/\s+/g, " ").includes("may be used ONLY where the source itself uses them"),
);

console.log("\n4. Facts, quantities and references survive the rewrite");

for (const kind of KINDS) {
  const flat = flatFor(kind);
  for (const preserved of [
    "quantities, dimensions, areas, volumes, durations and times",
    "dates, and the order in which a date is written",
    "locations: levels, rooms, plots, grid references, elevations, chainages",
    "materials, products and specifications",
    "plant and equipment, and how many of each",
    "every reference number",
  ]) {
    check(`${kind}: it preserves ${preserved.split(",")[0]}`, flat.includes(preserved), preserved);
  }
  check(`${kind}: never round, convert or renumber`, flat.includes("never round, convert, re-order,"));
  check(`${kind}: never invent`, flat.includes("never invent"));
  check(`${kind}: ambiguity resolves conservatively`, flat.includes("write the conservative"));
  check(`${kind}: silence is not evidence of absence`, flat.includes("silence is not evidence of absence"));
  check(`${kind}: an empty section is a correct answer`, flat.includes("an empty section is a correct answer"));
}

console.log("\n5. One glossary, hard-coded, and enforced");

const glossary = glossaryBlock();
check("the glossary is not empty", GLOSSARY.length >= 20, String(GLOSSARY.length));
for (const term of ["operatives", "making good", "reinstatement", "elevation", "substrate", "snagging"]) {
  check(`the glossary carries "${term}"`, glossary.includes(term));
}
check(
  "site shorthand is mapped to the report term, not the other way round",
  glossary.includes("operatives  <-  lads"),
);
check(
  "and the glossary is described as wording only, never a change of status",
  glossary.includes("it never changes what happened"),
);
check("British spellings are specified", BRITISH_CONVENTIONS.some((line) => line.includes("-ise")));
check(
  "programme, not schedule",
  BRITISH_CONVENTIONS.some((line) => line.includes("programme for a plan of work")),
);
for (const kind of KINDS) {
  check(`${kind}: the glossary reaches the model`, cleanupSystemPrompt(kind, BLOCKS).includes(glossary));
  check(
    `${kind}: the status discipline reaches the model`,
    cleanupSystemPrompt(kind, BLOCKS).includes(statusDisciplineBlock()),
  );
}

// No glossary term may itself be a claim about quality, compliance or approval:
// a preferred term that says "compliant" would smuggle past the status rules.
const CLAIMING = /\bcompliant\b|\bsafe\b|\bapproved\b|\bcertified\b|\btested\b|\bsatisfactory\b/i;
for (const term of GLOSSARY) {
  check(`"${term.preferred}" carries no quality or approval claim`, !CLAIMING.test(term.preferred));
}

console.log("\n6. Photographs and drawings are told apart only by metadata");

for (const kind of KINDS) {
  const flat = flatFor(kind);
  check(
    `${kind}: the model is told it cannot see any image or open any document`,
    flat.includes("you cannot see any image or open any document"),
  );
  check(
    `${kind}: only the metadata says what an item is`,
    flat.includes("the media metadata is the only thing that says what"),
  );
  check(
    `${kind}: an unknown item is not characterised`,
    flat.includes("do not characterise it at all"),
  );
  check(
    `${kind}: the type is never inferred from a caption, title or filename`,
    flat.includes("never infer the type from a caption, a title,"),
  );
  check(
    `${kind}: drawing numbers and revisions are reproduced exactly`,
    flat.includes("reference numbers, revisions and drawing numbers are reproduced exactly"),
  );
  check(`${kind}: an image is not an event`, flat.includes("a caption is not an event"));
}

const mediaPrompt = buildCleanupPrompt(inputFor("survey"));
check("the media block is labelled as the only basis for the distinction", mediaPrompt.includes(CLEANUP_MEDIA_LABEL));
check("a photograph is listed as a photograph", mediaPrompt.includes('- photograph "Safety"'));
check(
  "a drawing keeps its number and revision exactly",
  mediaPrompt.includes('- drawing (Drawing) A-101 rev C "Roof plan"'),
);
check(
  "another supporting document is named by its own type, not called a drawing",
  mediaPrompt.includes('- document (RAMS) RA-14 "Working at height"'),
);
check(
  "an unknown item is marked unknown rather than guessed",
  mediaPrompt.includes("metadata does not say what this is"),
);

console.log("\n7. The source material reaches the cleanup pass verbatim, and last");

for (const kind of KINDS) {
  const input = inputFor(kind);
  const before = JSON.stringify(input);
  const prompt = buildCleanupPrompt(input);
  check(`${kind}: the source appears exactly as given`, prompt.includes(SOURCE));
  check(
    `${kind}: it is last, directly under its label`,
    prompt.endsWith(`${CLEANUP_SOURCE_LABEL}\n${SOURCE}`),
    JSON.stringify(prompt.slice(-40)),
  );
  check(`${kind}: nothing trimmed the trailing space`, prompt.endsWith(" "));
  check(`${kind}: the line break survived`, prompt.includes("washers\nwere added"));
  check(`${kind}: the en dash survived`, prompt.includes("– 2no. coats"));
  check(`${kind}: building the prompt does not mutate the input`, JSON.stringify(input) === before);
}

check(
  "the source label calls it raw material to be rewritten, not corrected",
  /raw material/i.test(CLEANUP_SOURCE_LABEL) &&
    /rewritten/i.test(CLEANUP_SOURCE_LABEL) &&
    /not text to be corrected/i.test(CLEANUP_SOURCE_LABEL),
  CLEANUP_SOURCE_LABEL,
);
check(
  "and it does not reintroduce the proofreading framing",
  !/own words/i.test(CLEANUP_SOURCE_LABEL) && !/grammar/i.test(CLEANUP_SOURCE_LABEL),
);

console.log("\n8. Only section text comes back - no commentary, no review");

for (const kind of KINDS) {
  const flat = flatFor(kind);
  check(`${kind}: it returns only the rewritten section text`, flat.includes("return only the rewritten section text"));
  check(`${kind}: it does not comment, flag or explain`, flat.includes("do not"), "comment/flag/explain");
  check(`${kind}: it knows a second pass reviews it`, flat.includes("you are the first of two passes"));
  check(`${kind}: and that it is not that review`, flat.includes("you are not that review"));
  check(`${kind}: no markdown and no headings`, flat.includes("no headings, no markdown"));
}

console.log("\n9. The period summary is capped at three sentences by code, not by hope");

check("the cap is three", PERIOD_SUMMARY_MAX_SENTENCES === 3);
check("and it is applied to period_summary", CAPPED_SECTIONS.period_summary === 3);
check(
  "the brief says so too",
  /AT MOST THREE/.test(
    CLEANUP_SECTIONS.progress.find((section) => section.type === "period_summary").brief,
  ),
);
check(
  "four sentences become three",
  capSentences("One thing happened. Two happened. Three happened. Four happened.", 3) ===
    "One thing happened. Two happened. Three happened.",
);
check("three sentences are left alone", capSentences("A. B. C.", 3) === "A. B. C.");

// A wrong split truncates a report mid-fact, which is far worse than a missed
// one. These are the shapes site notes actually take.
check(
  "a quantity ending in a full stop does not end a sentence",
  splitSentences("Fitted 4no. brackets to level 2. Works continue.").length === 2,
);
check(
  "neither does approx.",
  splitSentences("Approx. 12m of trunking was installed. Works continue.").length === 2,
);
check(
  "nor a decimal",
  splitSentences("The slab is 2.5m wide. Works continue.").length === 2,
);
check(
  "nor an initial",
  splitSentences("Attended by M. Korzeniak of Empire Interiors. Works continue.").length === 2,
);
check("empty text splits into nothing", splitSentences("   ").length === 0);

console.log("\n10. Packaging is stripped, sentences are not");

check(
  "a markdown heading and the section's own label are removed",
  cleanSectionText("## Works completed: Installation works were completed.", "Works completed") ===
    "Installation works were completed.",
);
check(
  "a fenced block is unwrapped",
  cleanSectionText("```\nWorks were completed.\n```", "Works completed") === "Works were completed.",
);
check(
  "text with no packaging is returned untouched",
  cleanSectionText("Works were completed to the signage.", "Works completed") ===
    "Works were completed to the signage.",
);
check(
  "a full stop inside the text is not treated as packaging",
  cleanSectionText("Level 2. Level 3. Both were completed.", "Works completed") ===
    "Level 2. Level 3. Both were completed.",
);

console.log("\n11. A real round-trip, for all four kinds, through the request the app sends");

const stub = await startStub({ port: STUB_PORT });
try {
  for (const kind of KINDS) {
    const body = cleanupRequest(inputFor(kind), { model: "stub-model", ...BLOCKS });
    check(`${kind}: the request asks for structured output`, body.response_format.type === "json_schema");
    check(
      `${kind}: the schema is named for this document`,
      body.response_format.json_schema.name === `${kind}_cleanup_sections`,
    );
    check(
      `${kind}: every section is required, so an empty one is said rather than omitted`,
      body.response_format.json_schema.schema.required.join(",") === typesOf(cleanupSectionsFor(kind)),
    );
    check(`${kind}: the glossary is in the system message`, body.messages[0].content.includes(glossary));
    check(`${kind}: the source is in the user message`, body.messages[1].content.includes(SOURCE));

    const response = await fetch(`http://127.0.0.1:${STUB_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    const parsed = parseCleanupResponse(kind, payload.choices[0].message.content);

    check(`${kind}: the reply parses`, parsed.ok === true, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) continue;

    const definitions = cleanupSectionsFor(kind);
    check(
      `${kind}: the cleaned text came back`,
      Object.values(parsed.sections).some((text) => text.includes(CLEANUP_MARKER)),
    );
    check(
      `${kind}: the source reached the model`,
      JSON.stringify(parsed.sections).includes("sign put up on drawing A-101 rev C"),
    );
    check(
      `${kind}: empty sections are dropped rather than carried`,
      Object.keys(parsed.sections).length < definitions.length &&
        Object.values(parsed.sections).every((text) => text.trim().length > 0),
    );
    check(
      `${kind}: the markdown heading and label the model added are gone`,
      Object.values(parsed.sections).every(
        (text) => !text.startsWith("#") && !/^[A-Z][a-z ]+:\s/.test(text),
      ),
      JSON.stringify(parsed.sections[definitions[1].type]),
    );

    if (kind === "progress") {
      const summary = parsed.sections.period_summary;
      check(
        "progress: the five-sentence period summary was cut to three",
        splitSentences(summary).length === 3,
        summary,
      );
      check("progress: and it is the first three", summary.startsWith(CLEANUP_MARKER));
    }

    const formatted = formatCleanedSections(kind, parsed.sections);
    check(
      `${kind}: the review pass is handed labelled section text, in section order`,
      formatted.length === Object.keys(parsed.sections).length &&
        formatted.every((entry) => entry.label && entry.text),
    );
    check(
      `${kind}: and nothing empty is handed over`,
      formatted.every((entry) => entry.text.trim().length > 0),
    );
  }
} finally {
  await stub.close();
}

console.log("\n12. Hand-written text is still nobody's to overwrite");

const dailyAction = readFileSync(new URL("../app/(app)/reports/ai-actions.ts", import.meta.url), "utf8");
const summaryAction = readFileSync(
  new URL("../app/(app)/summary-reports/ai-actions.ts", import.meta.url),
  "utf8",
);

for (const [name, source] of [
  ["daily", dailyAction],
  ["summary", summaryAction],
]) {
  check(`${name}: cleanup runs before the review`, source.indexOf("cleanedSectionsFor") < source.indexOf("await generate"));
  check(
    `${name}: the review still runs, and is what writes`,
    /await generate(Sections|SummarySections)\(/.test(source),
  );
  check(
    `${name}: edited sections are still partitioned out of the write`,
    source.includes("partitionDraft("),
  );
  check(
    `${name}: what is written comes from the review, never from the cleanup pass`,
    /content: result\.sections\[/.test(source) && !/content: cleaned/.test(source),
  );
  check(`${name}: the cleanup output reaches the review prompt`, source.includes("cleanedSections,"));
  // No line may both name the cleanup output and write to the database. The
  // cleanup pass is an input to the review, and nothing it produces is stored:
  // that is what keeps it away from a paragraph somebody wrote themselves.
  const writesCleanup = source
    .split("\n")
    .filter((line) => /cleaned/i.test(line) && /\.(upsert|insert|update|delete)\(/.test(line));
  check(
    `${name}: nothing writes cleanup output to the database`,
    writesCleanup.length === 0,
    writesCleanup.join(" | "),
  );
}

console.log("\n=== Result ===");
if (failures.length === 0) {
  console.log("ALL CLEANUP CHECKS PASSED");
} else {
  for (const f of failures) console.log(`FAILED: ${f}`);
  process.exitCode = 1;
}
