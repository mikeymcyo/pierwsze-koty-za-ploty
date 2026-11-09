import assert from "node:assert/strict";
import { aiClient, aiModel, hasAiCredentials } from "../lib/ai/provider.ts";

// All requests stay inside this process, even if a developer has real keys set.
process.env.OPENAI_API_KEY = "test-openai";
process.env.OPENAI_BASE_URL = "https://stub.invalid/v1";
process.env.OPENAI_MODEL = "test-text";
process.env.OPENAI_VISION_MODEL = "test-vision";
process.env.ANTHROPIC_API_KEY = "test-anthropic";
delete process.env.ANTHROPIC_MODEL;

let calls = 0;
globalThis.fetch = async (url, init) => {
  calls++;
  assert.equal(String(url), "https://api.anthropic.com/v1/chat/completions");
  assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-anthropic");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "claude-sonnet-4-6");
  let content;
  if (body.response_format) {
    assert.equal(body.response_format.json_schema.strict, true);
    const keys = body.response_format.json_schema.schema.required;
    content = JSON.stringify(Object.fromEntries(keys.map(key => [key, "Two doors fitted."])));
  } else {
    assert.ok(body.messages[1].content.some(part => part.image_url?.url.startsWith("data:image/jpeg;base64,")));
    content = "Door frame in the loading bay.";
  }
  return Response.json({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] });
};

const { generateSections } = await import("../lib/ai/report-generation.ts");
const report = await generateSections({
  projectName: "Test site", rawNotes: "Two doors fitted.", reportDate: "2026-11-09",
  workforce: [], plant: [], photos: [],
}, { baseURL: "https://stub.invalid/override" });
assert.ok(report.ok, report.error);
const { describePhotograph } = await import("../lib/ai/photo-description.ts");
const photo = await describePhotograph({ data: Buffer.from([1]), mimeType: "image/jpeg" }, { projectName: "Test site" });
assert.ok(photo.ok, photo.error);
assert.equal(calls, 2);
process.env.ANTHROPIC_MODEL = "custom-claude";
assert.equal(aiModel("cleanup"), "custom-claude");
delete process.env.ANTHROPIC_API_KEY;
assert.equal(aiModel(), "test-text");
assert.equal(aiModel("vision"), "test-vision");
assert.equal(aiClient().baseURL, "https://stub.invalid/v1");
delete process.env.OPENAI_API_KEY;
assert.equal(aiClient(), null);
assert.equal(hasAiCredentials(), false);
console.log("Passed Claude routing for Daily and photograph, model selection, legacy configuration and missing keys.");
