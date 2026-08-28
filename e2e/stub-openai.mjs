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

export const STUB_PORT = 4010;

/** Echoed back in the sections so a test can prove the text came from here. */
export const STUB_MARKER = "STUBBED-SECTION";

export function sectionsFor(prompt) {
  // The prompt is echoed into one section so the test can assert the site
  // manager's own words actually reached the model.
  const notes = prompt.split(RAW_NOTES_LABEL)[1] ?? "";
  return {
    executive_summary: `${STUB_MARKER} summary`,
    works_completed: `${STUB_MARKER} works completed. Notes seen: ${notes.trim().slice(0, 60)}`,
    works_in_progress: "",
    deliveries_plant: `${STUB_MARKER} deliveries`,
    health_safety: "",
    issues_constraints: "",
    outstanding_items: "",
    planned_works: `${STUB_MARKER} planned works`,
  };
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
      const content = JSON.stringify(sectionsFor(prompt));

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
