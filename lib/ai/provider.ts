import "server-only";

import OpenAI from "openai";

const claudeEndpoint = "https://api.anthropic.com/v1";

export function hasAiCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

export function aiModel(task?: "cleanup" | "vision"): string {
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
  }
  if (task === "cleanup" && process.env.OPENAI_CLEANUP_MODEL?.trim()) return process.env.OPENAI_CLEANUP_MODEL.trim();
  if (task === "vision" && process.env.OPENAI_VISION_MODEL?.trim()) return process.env.OPENAI_VISION_MODEL.trim();
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.5";
}

/** The Claude key is only ever sent to Anthropic's own compatible API. */
export function aiClient(openAIBaseURL?: string): OpenAI | null {
  const claudeKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (claudeKey) {
    return new OpenAI({ apiKey: claudeKey, baseURL: claudeEndpoint, organization: null, project: null });
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: openAIBaseURL ?? (process.env.OPENAI_BASE_URL?.trim() || undefined) });
}
