/**
 * A local stand-in for the OpenAI chat completions endpoint.
 *
 * It exists so the whole drafting pipeline - prompt construction, the HTTP
 * call, schema-checked parsing, writing report_sections, and rendering them -
 * can be exercised end to end without a real API key and without spending
 * anything. Only the quality of a real model's prose is left unverified.
 *
 * It also asserts the shape of what we send, so the test fails if the app stops
 * requesting structured output or drops the notes from the prompt.
 */

import { createServer } from "node:http";

// Imported rather than copied: this label is what the stub splits the prompt
// on, and hardcoding it here once left the stub silently reading an empty
// string after the prompt was reworded.
import { RAW_NOTES_LABEL } from "../lib/ai/prompt.ts";
import { CLEANUP_SECTIONS, CLEANUP_SOURCE_LABEL } from "../lib/ai/cleanup-prompt.ts";

export const STUB_PORT = 4010;

/** Echoed back in the sections so a test can prove the text came from here. */
export const STUB_MARKER = "STUBBED-SECTION";

/** The same, for the cleanup pass, so the two are never confused for each other. */
export const CLEANUP_MARKER = "STUBBED-CLEANUP";

/**
 * Notes carrying this make the stub return a narrower draft, leaving two
 * sections empty that a first pass filled.
 *
 * A real second generation legitimately supports fewer sections than the
 * first, and that is the case worth testing: what happens to the paragraphs
 * the new draft no longer supports.
 */
export const NARROW_MARKER = "NARROW-DRAFT";

export function sectionsFor(prompt) {
  // The prompt is echoed into one section so the test can assert the site
  // manager's own words actually reached the model.
  const notes = prompt.split(RAW_NOTES_LABEL)[1] ?? "";
  const narrow = notes.includes(NARROW_MARKER);
  return {
    executive_summary: `${STUB_MARKER} summary`,
    works_completed: `${STUB_MARKER} works completed. Notes seen: ${notes.trim().slice(0, 60)}`,
    works_in_progress: "",
    deliveries_plant: narrow ? "" : `${STUB_MARKER} deliveries`,
    health_safety: "",
    issues_constraints: "",
    outstanding_items: "",
    planned_works: narrow ? "" : `${STUB_MARKER} planned works`,
  };
}

/**
 * The cleanup pass's reply, for whichever document the request asked about.
 *
 * The kind is read from the JSON schema name the app sends rather than guessed
 * from the prose, so this stays right if the prompt is reworded.
 *
 * Two of the fields are deliberately awkward. period_summary comes back with
 * five sentences, so a test can prove the three-sentence cap is enforced on
 * our side and not merely requested of the model; and one section arrives
 * wrapped in a markdown heading and its own label, which is what the
 * "return only the section text" instruction is up against.
 */
export function cleanupSectionsFor(prompt, kind) {
  const source = prompt.split(CLEANUP_SOURCE_LABEL)[1] ?? "";
  const definitions = CLEANUP_SECTIONS[kind] ?? [];
  const reply = {};

  // The echo goes in the first section the three-sentence cap does not apply
  // to, so that a test can assert both things at once without one truncating
  // the other.
  const echoable = definitions.filter((definition) => definition.type !== "period_summary");

  for (const definition of definitions) {
    if (definition.type === "period_summary") {
      reply[definition.type] =
        `${CLEANUP_MARKER} one. Sentence two. Sentence three. Sentence four. Sentence five.`;
    } else if (definition.type === echoable[0]?.type) {
      reply[definition.type] = `${CLEANUP_MARKER} lead. Source seen: ${source.trim().slice(0, 60)}`;
    } else if (definition.type === echoable[1]?.type) {
      // Packaging the app has to strip before this text is shown to anybody.
      reply[definition.type] = `## ${definition.label}: ${CLEANUP_MARKER} second section.`;
    } else {
      // Empty is a correct answer, and most sections should be.
      reply[definition.type] = "";
    }
  }

  return reply;
}

/** Which pass a request belongs to, from the schema name it asks for. */
export function requestedCleanupKind(parsed) {
  const name = parsed?.response_format?.json_schema?.name ?? "";
  const match = /^(daily|progress|completion|survey)_cleanup_sections$/.exec(name);
  return match ? match[1] : null;
}

export function startStub({ port = STUB_PORT } = {}) {
  const received = [];

  const server = createServer((req, res) => {
    if (!req.url?.endsWith("/chat/completions")) {
      res.writeHead(404).end("not found");
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      received.push(parsed);

      const prompt = parsed.messages?.map((m) => m.content).join("\n") ?? "";
      // The cleanup pass and the drafting pass hit the same endpoint and want
      // different shapes back. Answering a cleanup call with report sections
      // would fail its schema check, the app would fall back to the raw notes,
      // and the test would pass while exercising nothing.
      const cleanupKind = requestedCleanupKind(parsed);
      const content = JSON.stringify(
        cleanupKind ? cleanupSectionsFor(prompt, cleanupKind) : sectionsFor(prompt),
      );

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-stub",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: parsed.model ?? "stub",
          choices: [
            { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, received, close: () => new Promise((done) => server.close(done)) }),
    );
  });
}

// Runnable on its own: `node e2e/stub-openai.mjs`, for driving the app by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
  await startStub();
  console.log(`OpenAI stub listening on http://127.0.0.1:${STUB_PORT}/v1`);
}
